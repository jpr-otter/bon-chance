use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Authentication failed")]
    Authentication,

    #[error("Authorization failed")]
    Authorization,

    #[error("Not found")]
    NotFound,

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Internal server error")]
    Internal(#[from] anyhow::Error),

    #[error("Internal server error: {0}")]
    InternalServerError(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::Database(ref e) => {
                tracing::error!("Database error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
            }
            AppError::Validation(ref msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            AppError::Authentication => (StatusCode::UNAUTHORIZED, "Authentication failed"),
            AppError::Authorization => (StatusCode::FORBIDDEN, "Authorization failed"),
            AppError::NotFound => (StatusCode::NOT_FOUND, "Resource not found"),
            AppError::Conflict(ref msg) => (StatusCode::CONFLICT, msg.as_str()),
            AppError::Internal(ref e) => {
                tracing::error!("Internal error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
            }
            AppError::InternalServerError(ref msg) => {
                tracing::error!("Internal server error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, msg.as_str())
            }
            AppError::BadRequest(ref msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            AppError::Unauthorized(ref msg) => (StatusCode::UNAUTHORIZED, msg.as_str()),
        };

        let body = json!({
            "error": error_message,
        });

        (status, axum::Json(body)).into_response()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
