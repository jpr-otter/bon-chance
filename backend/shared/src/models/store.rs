use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Category {
    pub id: Uuid,
    pub name: String,
    pub parent_category_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Product {
    pub id: Uuid,
    pub name: String,
    pub default_category_id: Option<Uuid>,
    pub barcode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StoreChain {
    pub id: Uuid,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StoreLocation {
    pub id: Uuid,
    pub chain_id: Option<Uuid>,
    pub name: Option<String>,
    pub address: Option<String>,
    pub latitude: Option<rust_decimal::Decimal>,
    pub longitude: Option<rust_decimal::Decimal>,
}