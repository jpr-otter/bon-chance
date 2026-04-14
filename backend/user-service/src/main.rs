use axum::{
    routing::{delete, get, post},
    Router,
};
use sqlx::PgPool;
use std::sync::Arc;

mod auth;
mod handlers;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPool::connect(&database_url).await?;

    let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "your-secret-key".to_string());

    let app_state = Arc::new(AppState {
        db: pool,
        jwt_secret,
    });

    let app = Router::new()
        .route("/register", post(handlers::register_user))
        .route("/login", post(handlers::login_user))
        .route("/admin/users", get(handlers::get_all_users))
        .route("/admin/users/:user_id", delete(handlers::delete_user))
        .route(
            "/admin/users/:user_id/receipts",
            get(handlers::get_user_receipts),
        )
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
