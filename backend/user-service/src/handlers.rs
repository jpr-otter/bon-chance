use axum::{
    extract::{Extension, Json},
    response::Json as JsonResponse,
};
use axum_extra::{
    headers::{authorization::Bearer, Authorization},
    TypedHeader,
};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use shared::{
    AdminUserResponse, AppError, CreateUserRequest, LoginRequest, LoginResponse, ReceiptSummary,
    RegisterResponse, Result, User, UserInfo, UserResponse,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::{create_jwt, hash_password, verify_jwt, verify_password};
use crate::AppState;

#[derive(sqlx::FromRow)]
struct ReceiptQueryResult {
    id: Uuid,
    user_id: Uuid,
    purchase_date: DateTime<Utc>,
    total_amount: Decimal,
    items_count: Option<i64>,
}

pub async fn register_user(
    Extension(state): Extension<Arc<AppState>>,
    Json(request): Json<CreateUserRequest>,
) -> Result<JsonResponse<RegisterResponse>> {
    // Validate email format (basic check)
    if !request.email.contains('@') {
        return Err(AppError::Validation("Invalid email format".to_string()));
    }

    if request.password.len() < 6 {
        return Err(AppError::Validation(
            "Password must be at least 6 characters".to_string(),
        ));
    }

    // Hash password
    let password_hash = hash_password(&request.password).await?;

    // Check if user already exists
    let existing_user = sqlx::query!("SELECT id FROM users WHERE email = $1", request.email)
        .fetch_optional(&state.db)
        .await?;

    if existing_user.is_some() {
        return Err(AppError::Conflict("Email already registered".to_string()));
    }

    // Create user
    let user_id = Uuid::new_v4();
    let now = Utc::now();

    let user = sqlx::query_as!(
        User,
        r#"
        INSERT INTO users (id, email, password_hash, username, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, password_hash, username, created_at, updated_at
        "#,
        user_id,
        request.email,
        password_hash,
        request.username,
        now,
        now
    )
    .fetch_one(&state.db)
    .await?;

    // Create JWT token for immediate login
    let token = create_jwt(&user.id, &state.jwt_secret)?;

    let response = RegisterResponse {
        token,
        user: UserInfo {
            id: user.id,
            email: user.email,
            username: user.username,
        },
    };

    Ok(JsonResponse(response))
}

pub async fn login_user(
    Extension(state): Extension<Arc<AppState>>,
    Json(request): Json<LoginRequest>,
) -> Result<JsonResponse<LoginResponse>> {
    // Get user from database (search by email or username)
    let user = sqlx::query_as!(
        User,
        "SELECT id, email, password_hash, username, created_at, updated_at FROM users WHERE email = $1 OR username = $1",
        request.login
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Authentication)?;

    // Verify password
    if !verify_password(&request.password, &user.password_hash).await? {
        return Err(AppError::Authentication);
    }

    // Create JWT token
    let token = create_jwt(&user.id, &state.jwt_secret)?;

    let response = LoginResponse {
        token,
        user: UserInfo {
            id: user.id,
            email: user.email,
            username: user.username,
        },
    };

    Ok(JsonResponse(response))
}

pub async fn get_current_user(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
) -> Result<JsonResponse<UserResponse>> {
    // Extract and verify JWT token
    let user_id = verify_jwt(authorization.token(), &state.jwt_secret)?;

    // Get user from database
    let user = sqlx::query_as!(
        User,
        "SELECT id, email, password_hash, username, created_at, updated_at FROM users WHERE id = $1",
        user_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let response = UserResponse {
        id: user.id,
        email: user.email,
        username: user.username,
        created_at: user.created_at,
    };

    Ok(JsonResponse(response))
}

// Admin-only endpoints
pub async fn get_all_users(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
) -> Result<JsonResponse<Vec<AdminUserResponse>>> {
    // Verify JWT and check if user is admin
    let token = authorization.token();
    let user_id = verify_jwt(token, &state.jwt_secret)?;

    // Check if user is admin by checking username
    let admin_user = sqlx::query_as!(
        User,
        "SELECT id, email, password_hash, username, created_at, updated_at FROM users WHERE id = $1 AND username = 'admin'",
        user_id
    )
    .fetch_optional(&state.db)
    .await?;

    if admin_user.is_none() {
        return Err(AppError::Authentication);
    }

    // Get all users
    let users = sqlx::query_as!(
        User,
        "SELECT id, email, password_hash, username, created_at, updated_at FROM users"
    )
    .fetch_all(&state.db)
    .await?;

    let response: Vec<AdminUserResponse> = users
        .into_iter()
        .map(|user| AdminUserResponse {
            id: user.id,
            email: user.email,
            username: user.username,
            created_at: user.created_at,
            updated_at: user.updated_at,
        })
        .collect();

    Ok(JsonResponse(response))
}

pub async fn get_user_receipts(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
    axum::extract::Path(user_id): axum::extract::Path<Uuid>,
) -> Result<JsonResponse<Vec<ReceiptSummary>>> {
    // Verify JWT and check if user is admin
    let token = authorization.token();
    let admin_user_id = verify_jwt(token, &state.jwt_secret)?;

    // Check if user is admin
    let admin_user = sqlx::query_as!(
        User,
        "SELECT id, email, password_hash, username, created_at, updated_at FROM users WHERE id = $1 AND username = 'admin'",
        admin_user_id
    )
    .fetch_optional(&state.db)
    .await?;

    if admin_user.is_none() {
        return Err(AppError::Authentication);
    }

    // Get receipts for the user from the database
    let receipts = sqlx::query_as!(
        ReceiptQueryResult,
        "SELECT id, user_id, purchase_date, total_amount, (SELECT COUNT(*) FROM items WHERE receipt_id = receipts.id) as items_count FROM receipts WHERE user_id = $1 ORDER BY purchase_date DESC",
        user_id
    )
    .fetch_all(&state.db)
    .await?;

    let response: Vec<ReceiptSummary> = receipts
        .into_iter()
        .map(|receipt| ReceiptSummary {
            id: receipt.id,
            purchase_date: receipt.purchase_date,
            total_amount: receipt.total_amount,
            items_count: receipt.items_count.unwrap_or(0) as i32,
        })
        .collect();

    Ok(JsonResponse(response))
}

pub async fn delete_user(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
    axum::extract::Path(user_id): axum::extract::Path<Uuid>,
) -> Result<JsonResponse<()>> {
    // Verify JWT token
    let admin_user_id = verify_jwt(authorization.token(), &state.jwt_secret)?;

    // Get current user to verify admin status
    let current_user = sqlx::query!("SELECT username FROM users WHERE id = $1", admin_user_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::Unauthorized("User not found".to_string()))?;

    // Check if user is admin
    if current_user.username.as_deref() != Some("admin") {
        return Err(AppError::Authorization);
    }

    // Prevent admin from deleting themselves
    if admin_user_id == user_id {
        return Err(AppError::Validation(
            "Cannot delete your own account".to_string(),
        ));
    }

    // Start a transaction to ensure data consistency
    let mut tx = state.db.begin().await?;

    // Delete user's items first (foreign key constraint)
    sqlx::query!(
        "DELETE FROM items WHERE receipt_id IN (SELECT id FROM receipts WHERE user_id = $1)",
        user_id
    )
    .execute(&mut *tx)
    .await?;

    // Delete user's receipts
    sqlx::query!("DELETE FROM receipts WHERE user_id = $1", user_id)
        .execute(&mut *tx)
        .await?;

    // Delete the user
    let result = sqlx::query!("DELETE FROM users WHERE id = $1", user_id)
        .execute(&mut *tx)
        .await?;

    if result.rows_affected() == 0 {
        tx.rollback().await?;
        return Err(AppError::NotFound);
    }

    // Commit the transaction
    tx.commit().await?;

    Ok(JsonResponse(()))
}
