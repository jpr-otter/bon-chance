use axum::{
    response::Json,
    routing::{delete, get, post},
    Router,
};
use serde_json;
use sqlx::PgPool;
use std::sync::Arc;

mod auth;
mod db;
mod handlers;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "dev-secret-key".to_string());

    let pool = PgPool::connect(&database_url).await?;

    let app_state = Arc::new(AppState {
        db: pool,
        jwt_secret,
    });

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/receipts/bulk-delete", post(handlers::bulk_delete_receipts))
        .route("/receipts/upload", post(handlers::upload_receipt))
        .route("/receipts", post(handlers::create_receipt).get(handlers::get_user_receipts))
        .route(
            "/receipts/:id",
            get(handlers::get_receipt)
                .delete(handlers::delete_receipt)
                .put(handlers::update_receipt),
        )
        // Budget routes
        .route("/budgets", get(handlers::get_budgets).post(handlers::upsert_budget))
        .route("/budgets/:category", get(handlers::get_budget).delete(handlers::delete_budget))
        .route("/budgets/spending/current", get(handlers::get_current_spending))
        .layer(axum::extract::Extension(app_state));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3002").await?;
    println!("🧾 Receipt Service listening on http://0.0.0.0:3002");

    axum::serve(listener, app).await?;

    Ok(())
}

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub jwt_secret: String,
}

async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "receipt-service"
    }))
}
