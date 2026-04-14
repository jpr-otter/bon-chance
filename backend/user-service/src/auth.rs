use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use shared::{AppError, Result};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // Subject (user ID)
    pub exp: usize,  // Expiration time
}

pub async fn hash_password(password: &str) -> Result<String> {
    let argon2 = Argon2::default();
    let salt = SaltString::generate(&mut OsRng);

    // Spawn blocking task for CPU-intensive operation
    let password = password.to_string();
    let hash = tokio::task::spawn_blocking(move || {
        argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Password hashing failed: {}", e)))
            .map(|hash| hash.to_string())
    })
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("Task join failed: {}", e)))??;

    Ok(hash)
}

pub async fn verify_password(password: &str, hash: &str) -> Result<bool> {
    let password = password.to_string();
    let hash = hash.to_string();

    let result = tokio::task::spawn_blocking(move || -> std::result::Result<bool, AppError> {
        let parsed_hash = PasswordHash::new(&hash)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Invalid password hash: {}", e)))?;

        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok())
    })
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("Task join failed: {}", e)))??;

    Ok(result)
}

pub fn create_jwt(user_id: &Uuid, secret: &str) -> Result<String> {
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(24))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: user_id.to_string(),
        exp: expiration,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("JWT creation failed: {}", e)))?;

    Ok(token)
}

pub fn verify_jwt(token: &str, secret: &str) -> Result<Uuid> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_ref()),
        &Validation::default(),
    )
    .map_err(|_| AppError::Authentication)?;

    let user_id = Uuid::parse_str(&token_data.claims.sub).map_err(|_| AppError::Authentication)?;

    Ok(user_id)
}
