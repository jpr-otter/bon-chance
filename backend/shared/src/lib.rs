pub mod error;
pub mod models;

pub use error::{AppError, Result};

// Re-export commonly used types
pub use models::receipt::*;
pub use models::store::*;
pub use models::user::*;
