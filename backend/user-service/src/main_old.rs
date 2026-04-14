use axum::{
    extract::State,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use shared::AppError;
use sqlx::{PgPool, Row};
use std::sync::Arc;

mod handlers;
mod auth;
use uuid::Uuid;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv::dotenv().ok();
    
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let pool = PgPool::connect(&database_url).await?;
    
    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "your-secret-key".to_string());

    let app_state = Arc::new(AppState { 
        db: pool,
        jwt_secret,
    });

    let app = Router::new()
        .route("/register", post(handlers::register_user))
        .route("/login", post(handlers::login_user))
        .route("/health", get(health_check))
        .layer(axum::extract::Extension(app_state));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001").await?;
    println!("👤 User Service listening on http://0.0.0.0:3001");

    axum::serve(listener, app).await?;

    Ok(())
}

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub jwt_secret: String,
}

async fn health_check() -> &'static str {
    "User service is healthy"
}

#[derive(Deserialize)]
struct RegisterRequest {
    email: String,
    password: String,
    username: String,
}

#[derive(Deserialize)]
struct LoginRequest {
    login: String, // Can be email or username
    password: String,
}

#[derive(Serialize)]
struct AuthResponse {
    user_id: String,
    email: String,
    username: String,
    message: String,
}

async fn register_user(
    State(state): State<Arc<AppState>>,
    Json(request): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let user_id = Uuid::new_v4();
    let password_hash = bcrypt::hash(&request.password, 12)
        .map_err(|_| AppError::InternalServerError("Failed to hash password".to_string()))?;

    sqlx::query(
        "INSERT INTO users (id, email, password_hash, username) VALUES ($1, $2, $3, $4)"
    )
    .bind(user_id)
    .bind(&request.email)
    .bind(&password_hash)
    .bind(&request.username)
    .execute(&state.pool)
    .await
    .map_err(|e| AppError::BadRequest(format!("Failed to create user: {}", e)))?;

    Ok(Json(AuthResponse {
        user_id: user_id.to_string(),
        email: request.email,
        username: request.username,
        message: "User registered successfully".to_string(),
    }))
}

async fn login_user(
    State(state): State<Arc<AppState>>,
    Json(request): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    // Check if login is email (contains @) or username
    let query = if request.login.contains('@') {
        "SELECT id, email, password_hash, username FROM users WHERE email = $1"
    } else {
        "SELECT id, email, password_hash, username FROM users WHERE username = $1"
    };

    let user_row = sqlx::query(query)
        .bind(&request.login)
        .fetch_optional(&state.pool)
        .await
    .map_err(|e| AppError::InternalServerError(format!("Database error: {}", e)))?;

    let user_row = user_row.ok_or_else(|| AppError::Unauthorized("Invalid credentials".to_string()))?;

    let stored_password_hash: String = user_row.get("password_hash");
    
    let is_valid = bcrypt::verify(&request.password, &stored_password_hash)
        .map_err(|_| AppError::InternalServerError("Failed to verify password".to_string()))?;

    if !is_valid {
        return Err(AppError::Unauthorized("Invalid credentials".to_string()));
    }

    let user_id: Uuid = user_row.get("id");
    let email: String = user_row.get("email");
    let username: String = user_row.get("username");

    Ok(Json(AuthResponse {
        user_id: user_id.to_string(),
        email,
        username,
        message: "Login successful".to_string(),
    }))
}

async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "user-service"
    }))
}
