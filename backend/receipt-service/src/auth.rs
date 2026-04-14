use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use shared::{AppError, Result};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
}

pub fn verify_jwt(token: &str, secret: &str) -> Result<Uuid> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_ref()),
        &Validation::default(),
    )
    .map_err(|_| AppError::Authentication)?;

    let user_id = Uuid::parse_str(&token_data.claims.sub)
        .map_err(|_| AppError::Authentication)?;

    Ok(user_id)
}