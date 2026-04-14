use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ReceiptStatus {
    #[serde(rename = "PENDING")]
    Pending,
    #[serde(rename = "PROCESSING")]
    Processing,
    #[serde(rename = "DONE")]
    Done,
    #[serde(rename = "FAILED")]
    Failed,
    #[serde(rename = "NEEDS_REVIEW")]
    NeedsReview,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Receipt {
    pub id: Uuid,
    pub user_id: Uuid,
    pub store_location_id: Option<Uuid>,
    pub purchase_date: DateTime<Utc>,
    pub total_amount: rust_decimal::Decimal,
    pub raw_text: Option<String>,
    pub image_url: Option<String>,
    pub status: String, // Will be converted to/from ReceiptStatus
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ReceiptItem {
    pub id: Uuid,
    pub receipt_id: Uuid,
    pub product_id: Option<Uuid>,
    pub description_raw: String,
    pub price: rust_decimal::Decimal,
    pub quantity: rust_decimal::Decimal,
    pub unit_type: Option<String>,
    pub category_id: Option<Uuid>,
    pub is_corrected_by_user: bool,
    pub confidence_score: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreateReceiptRequest {
    pub purchase_date: Option<DateTime<Utc>>,
    pub total_amount: rust_decimal::Decimal,
    pub store_name: Option<String>,
    pub note: Option<String>,
    pub raw_text: Option<String>,
    pub items: Vec<CreateReceiptItemRequest>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreateReceiptItemRequest {
    pub description: String,
    pub price: rust_decimal::Decimal,
    pub quantity: rust_decimal::Decimal,
    pub category_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateReceiptRequest {
    pub purchase_date: Option<DateTime<Utc>>,
    pub total_amount: Option<rust_decimal::Decimal>,
    pub store_name: Option<String>,
    pub note: Option<String>,
    pub items: Option<Vec<CreateReceiptItemRequest>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReceiptResponse {
    pub id: Uuid,
    pub user_id: Uuid,
    pub purchase_date: DateTime<Utc>,
    pub total_amount: rust_decimal::Decimal,
    pub store_name: Option<String>,
    pub raw_text: Option<String>,
    pub status: ReceiptStatus,
    pub created_at: DateTime<Utc>,
    pub items: Vec<ReceiptItemResponse>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReceiptItemResponse {
    pub id: Uuid,
    pub description: String,
    pub price: rust_decimal::Decimal,
    pub quantity: rust_decimal::Decimal,
    pub category_name: Option<String>,
    pub is_corrected_by_user: bool,
    pub confidence_score: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BulkDeleteReceiptsRequest {
    pub receipt_ids: Vec<Uuid>,
}
