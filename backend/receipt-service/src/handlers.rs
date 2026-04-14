use axum::{
    extract::{Extension, Path, Query, Multipart},
    response::Json as JsonResponse,
    Json,
};
use axum_extra::{
    headers::{authorization::Bearer, Authorization},
    TypedHeader,
};
use chrono::Utc;
use shared::{
    AppError, BulkDeleteReceiptsRequest, CreateReceiptRequest, ReceiptItemResponse,
    ReceiptResponse, ReceiptStatus, Result, UpdateReceiptRequest,
};
use std::sync::Arc;
use uuid::Uuid;
use reqwest::Client;
use regex::Regex;
use rust_decimal::Decimal;
use std::str::FromStr;

use crate::auth::verify_jwt;
use crate::AppState;
use crate::db;

#[derive(serde::Deserialize)]
pub struct GetReceiptsQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn create_receipt(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
    Json(request): Json<CreateReceiptRequest>,
) -> Result<JsonResponse<ReceiptResponse>> {
    let user_id = verify_jwt(authorization.token(), &state.jwt_secret)?;

    let receipt_id = db::create_receipt(&state.db, user_id, request.clone())
        .await
        .map_err(|e| AppError::InternalServerError(e.to_string()))?;

    let now = Utc::now();
    let purchase_date = request.purchase_date.unwrap_or(now);

    let items = request
        .items
        .into_iter()
        .map(|item| ReceiptItemResponse {
            id: Uuid::new_v4(), // Placeholder ID as we don't return DB IDs yet
            description: item.description,
            price: item.price,
            quantity: item.quantity,
            category_name: item.category_name,
            is_corrected_by_user: false,
            confidence_score: None,
        })
        .collect();

    Ok(Json(ReceiptResponse {
        id: receipt_id,
        user_id,
        store_name: request.store_name,
        purchase_date,
        total_amount: request.total_amount,
        status: ReceiptStatus::Done,
        items,
        created_at: now,
        raw_text: request.raw_text,
    }))
}

pub async fn get_user_receipts(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
    Query(query): Query<GetReceiptsQuery>,
) -> Result<JsonResponse<Vec<ReceiptResponse>>> {
    let user_id = verify_jwt(authorization.token(), &state.jwt_secret)?;

    // Increased limits for dashboard data
    let limit = query.limit.unwrap_or(1000).min(5000);
    let offset = query.offset.unwrap_or(0);

    let receipts = db::get_user_receipts(&state.db, user_id, limit, offset)
        .await
        .map_err(|e| AppError::InternalServerError(e.to_string()))?;

    Ok(JsonResponse(receipts))
}

pub async fn get_receipt(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
    Path(receipt_id): Path<Uuid>,
) -> Result<JsonResponse<ReceiptResponse>> {
    let user_id = verify_jwt(authorization.token(), &state.jwt_secret)?;

    let receipt = db::get_receipt_by_id(&state.db, receipt_id, user_id)
        .await
        .map_err(|e| AppError::InternalServerError(e.to_string()))?
        .ok_or(AppError::NotFound)?;

    Ok(JsonResponse(receipt))
}

pub async fn delete_receipt(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
    Path(id): Path<Uuid>,
) -> Result<impl axum::response::IntoResponse> {
    let user_id = verify_jwt(authorization.token(), &state.jwt_secret)?;

    let deleted = db::delete_receipt(&state.db, id, user_id)
        .await
        .map_err(|e| AppError::InternalServerError(e.to_string()))?;

    if !deleted {
        return Err(AppError::NotFound);
    }

    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn bulk_delete_receipts(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
    Json(request): Json<BulkDeleteReceiptsRequest>,
) -> Result<impl axum::response::IntoResponse> {
    let user_id = verify_jwt(authorization.token(), &state.jwt_secret)?;

    db::bulk_delete_receipts(&state.db, &request.receipt_ids, user_id)
        .await
        .map_err(|e| AppError::InternalServerError(e.to_string()))?;

    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn update_receipt(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
    Path(id): Path<Uuid>,
    Json(request): Json<UpdateReceiptRequest>,
) -> Result<JsonResponse<ReceiptResponse>> {
    let user_id = verify_jwt(authorization.token(), &state.jwt_secret)?;

    let receipt = db::update_receipt(&state.db, id, user_id, request)
        .await
        .map_err(|e| AppError::InternalServerError(e.to_string()))?
        .ok_or(AppError::NotFound)?;

    Ok(JsonResponse(receipt))
}

pub async fn upload_receipt(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
    mut multipart: Multipart,
) -> Result<JsonResponse<ReceiptResponse>> {
    let user_id = verify_jwt(authorization.token(), &state.jwt_secret)?;

    let mut file_bytes = Vec::new();
    let mut filename = String::new();

    while let Some(field) = multipart.next_field().await.map_err(|_| AppError::BadRequest("Multipart error".to_string()))? {
        let name = field.name().unwrap_or("").to_string();
        if name == "image" {
            filename = field.file_name().unwrap_or("receipt.jpg").to_string();
            file_bytes = field.bytes().await.map_err(|_| AppError::BadRequest("File read error".to_string()))?.to_vec();
            break;
        }
    }

    if file_bytes.is_empty() {
        return Err(AppError::BadRequest("No image file provided".to_string()));
    }

    // Call OCR Service
    let client = Client::new();
    let part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name(filename)
        .mime_str("image/jpeg")
        .map_err(|e| AppError::InternalServerError(e.to_string()))?;

    let form = reqwest::multipart::Form::new().part("file", part);

    let ocr_url = std::env::var("OCR_SERVICE_URL").unwrap_or_else(|_| "http://localhost:3003".to_string());
    
    let ocr_response = client
        .post(format!("{}/ocr/process", ocr_url))
        .multipart(form)
        .send()
        .await
        .map_err(|e| AppError::InternalServerError(format!("OCR Service error: {}", e)))?;

    if !ocr_response.status().is_success() {
        return Err(AppError::InternalServerError("OCR Service failed".to_string()));
    }

    let ocr_result: serde_json::Value = ocr_response.json().await.map_err(|_| AppError::InternalServerError("Failed to parse OCR response".to_string()))?;
    let text = ocr_result["text"].as_str().unwrap_or("");

    // Parse Text for store and total
    let (store_name, total_amount, date) = parse_receipt_text(text);

    // Parse items from OCR response
    let ocr_items = ocr_result["items"].as_array();
    let items: Vec<shared::CreateReceiptItemRequest> = if let Some(ocr_items) = ocr_items {
        ocr_items.iter().filter_map(|item| {
            let description = item["description"].as_str()?;
            let price = item["price"].as_f64()?;
            let quantity = item["quantity"].as_f64().unwrap_or(1.0);
            let category = item["category"].as_str().map(|s| s.to_string());
            
            Some(shared::CreateReceiptItemRequest {
                description: description.to_string(),
                price: Decimal::from_str(&format!("{:.2}", price)).unwrap_or(Decimal::new(0, 2)),
                quantity: Decimal::from_str(&format!("{:.3}", quantity)).unwrap_or(Decimal::new(1, 0)),
                category_name: category,
            })
        }).collect()
    } else {
        vec![]
    };

    // Create Receipt
    let request = CreateReceiptRequest {
        store_name: Some(store_name),
        total_amount,
        purchase_date: Some(date),
        items: items.clone(),
        note: Some("Scanned receipt".to_string()),
        raw_text: Some(text.to_string()),
    };

    let receipt_id = db::create_receipt(&state.db, user_id, request.clone())
        .await
        .map_err(|e| AppError::InternalServerError(e.to_string()))?;

    // Build item responses
    let item_responses: Vec<ReceiptItemResponse> = items.iter().map(|item| {
        ReceiptItemResponse {
            id: Uuid::new_v4(),
            description: item.description.clone(),
            price: item.price,
            quantity: item.quantity,
            category_name: item.category_name.clone(),
            is_corrected_by_user: false,
            confidence_score: None,
        }
    }).collect();

    // Return the created receipt
    let response = ReceiptResponse {
        id: receipt_id,
        user_id,
        store_name: request.store_name,
        purchase_date: request.purchase_date.unwrap(),
        total_amount: request.total_amount,
        status: ReceiptStatus::NeedsReview,
        items: item_responses,
        created_at: Utc::now(),
        raw_text: request.raw_text,
    };

    Ok(Json(response))
}

fn parse_receipt_text(text: &str) -> (String, Decimal, chrono::DateTime<Utc>) {
    let text_lower = text.to_lowercase();
    
    let store_name = if text_lower.contains("rewe") {
        "REWE".to_string()
    } else if text_lower.contains("aldi") {
        "ALDI".to_string()
    } else if text_lower.contains("lidl") {
        "LIDL".to_string()
    } else if text_lower.contains("edeka") {
        "EDEKA".to_string()
    } else if text_lower.contains("netto") {
        "Netto".to_string()
    } else if text_lower.contains("penny") {
        "Penny".to_string()
    } else if text_lower.contains("kaufland") {
        "Kaufland".to_string()
    } else if text_lower.contains("real") {
        "Real".to_string()
    } else if text_lower.contains("dm") || text_lower.contains("dm-drogerie") {
        "dm".to_string()
    } else if text_lower.contains("rossmann") {
        "Rossmann".to_string()
    } else if text_lower.contains("müller") {
        "Müller".to_string()
    } else if text_lower.contains("tegut") {
        "Tegut".to_string()
    } else if text_lower.contains("norma") {
        "Norma".to_string()
    } else if text_lower.contains("hit") {
        "HIT".to_string()
    } else if text_lower.contains("globus") {
        "Globus".to_string()
    } else if text_lower.contains("famila") {
        "Famila".to_string()
    } else if text_lower.contains("marktkauf") {
        "Marktkauf".to_string()
    } else if text_lower.contains("combi") {
        "Combi".to_string()
    } else if text_lower.contains("sky") {
        "Sky".to_string()
    } else {
        "Unbekannter Laden".to_string()
    };

    // Extended patterns for total amount on German receipts
    // Common terms: Summe, Gesamt, Gesamtbetrag, Zu zahlen, Betrag, Total, Endsumme, Bar, EC-Karte, etc.
    let total_patterns = [
        r"(?i)(summe|summa)[\s:.]*[€EUR]*\s*(\d+[.,]\d{2})",
        r"(?i)(gesamt|gesamtbetrag|gesamtsumme)[\s:.]*[€EUR]*\s*(\d+[.,]\d{2})",
        r"(?i)(zu\s*zahlen|zahlbetrag|zahlbar)[\s:.]*[€EUR]*\s*(\d+[.,]\d{2})",
        r"(?i)(total|betrag|endsumme)[\s:.]*[€EUR]*\s*(\d+[.,]\d{2})",
        r"(?i)(bar|gegeben|rückgeld)[\s:.]*[€EUR]*\s*(\d+[.,]\d{2})",
        r"(?i)(ec-?karte|kartenzahlung|karte)[\s:.]*[€EUR]*\s*(\d+[.,]\d{2})",
        r"(?i)(visa|mastercard|maestro|girocard|v\s*pay)[\s:.]*[€EUR]*\s*(\d+[.,]\d{2})",
        r"(?i)(rechnungsbetrag|brutto)[\s:.]*[€EUR]*\s*(\d+[.,]\d{2})",
        r"(?i)(eur|€)\s*(\d+[.,]\d{2})\s*$",
    ];

    let mut total_amount = Decimal::new(0, 2);
    
    // Try each pattern in order of priority
    for pattern in total_patterns {
        let re = Regex::new(pattern).unwrap();
        if let Some(caps) = re.captures(text) {
            if let Some(amount_str) = caps.get(2) {
                let s = amount_str.as_str().replace(",", ".");
                if let Ok(amount) = Decimal::from_str(&s) {
                    if amount > Decimal::new(0, 2) && amount < Decimal::new(10000, 0) {
                        total_amount = amount;
                        break;
                    }
                }
            }
        }
    }
    
    // Fallback: find the largest number that looks like a price (likely the total)
    if total_amount == Decimal::new(0, 2) {
        let re_price = Regex::new(r"(\d+[.,]\d{2})").unwrap();
        let mut max_amount = Decimal::new(0, 2);
        for caps in re_price.captures_iter(text) {
            if let Some(amount_str) = caps.get(1) {
                let s = amount_str.as_str().replace(",", ".");
                if let Ok(amount) = Decimal::from_str(&s) {
                    if amount > max_amount && amount < Decimal::new(1000, 0) {
                        max_amount = amount;
                    }
                }
            }
        }
        total_amount = max_amount;
    }

    // Date parsing - try common German date formats
    let date = parse_receipt_date(text).unwrap_or_else(Utc::now);

    (store_name, total_amount, date)
}

fn parse_receipt_date(text: &str) -> Option<chrono::DateTime<Utc>> {
    // Common German date formats on receipts
    let date_patterns = [
        // DD.MM.YYYY or DD.MM.YY
        (r"(\d{2})\.(\d{2})\.(\d{4})", vec![1, 2, 3]),
        (r"(\d{2})\.(\d{2})\.(\d{2})\b", vec![1, 2, 3]),
        // DD/MM/YYYY
        (r"(\d{2})/(\d{2})/(\d{4})", vec![1, 2, 3]),
        // YYYY-MM-DD (ISO)
        (r"(\d{4})-(\d{2})-(\d{2})", vec![3, 2, 1]),
    ];
    
    for (pattern, order) in date_patterns {
        let re = Regex::new(pattern).ok()?;
        if let Some(caps) = re.captures(text) {
            let day: u32 = caps.get(order[0])?.as_str().parse().ok()?;
            let month: u32 = caps.get(order[1])?.as_str().parse().ok()?;
            let mut year: i32 = caps.get(order[2])?.as_str().parse().ok()?;
            
            // Handle 2-digit years
            if year < 100 {
                year += 2000;
            }
            
            // Validate date components
            if day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2100 {
                if let Some(date) = chrono::NaiveDate::from_ymd_opt(year, month, day) {
                    return Some(date.and_hms_opt(12, 0, 0)?.and_utc());
                }
            }
        }
    }
    
    None
}

// ============================================================================
// Budget Handlers
// ============================================================================

#[derive(serde::Serialize, serde::Deserialize)]
pub struct BudgetRequest {
    pub category_name: String,
    pub monthly_limit: Decimal,
}

#[derive(serde::Serialize)]
pub struct BudgetResponse {
    pub id: Uuid,
    pub category_name: String,
    pub monthly_limit: Decimal,
    pub current_spending: Decimal,
    pub percentage_used: f64,
}

#[derive(serde::Serialize)]
pub struct SpendingByCategory {
    pub category_name: String,
    pub total_spent: Decimal,
    pub budget_limit: Option<Decimal>,
    pub percentage_used: Option<f64>,
}

/// Get all budgets for the current user
pub async fn get_budgets(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
) -> Result<JsonResponse<Vec<BudgetResponse>>> {
    let user_id = verify_jwt(authorization.token(), &state.jwt_secret)?;
    
    let budgets = db::get_user_budgets(&state.db, user_id)
        .await
        .map_err(|e| AppError::InternalServerError(e.to_string()))?;
    
    Ok(JsonResponse(budgets))
}

/// Get a specific budget by category
pub async fn get_budget(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
    Path(category): Path<String>,
) -> Result<JsonResponse<Option<BudgetResponse>>> {
    let user_id = verify_jwt(authorization.token(), &state.jwt_secret)?;
    
    let budget = db::get_budget_by_category(&state.db, user_id, &category)
        .await
        .map_err(|e| AppError::InternalServerError(e.to_string()))?;
    
    Ok(JsonResponse(budget))
}

/// Create or update a budget
pub async fn upsert_budget(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
    Json(request): Json<BudgetRequest>,
) -> Result<JsonResponse<BudgetResponse>> {
    let user_id = verify_jwt(authorization.token(), &state.jwt_secret)?;
    
    let budget = db::upsert_budget(&state.db, user_id, &request.category_name, request.monthly_limit)
        .await
        .map_err(|e| AppError::InternalServerError(e.to_string()))?;
    
    Ok(JsonResponse(budget))
}

/// Delete a budget
pub async fn delete_budget(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
    Path(category): Path<String>,
) -> Result<JsonResponse<serde_json::Value>> {
    let user_id = verify_jwt(authorization.token(), &state.jwt_secret)?;
    
    db::delete_budget(&state.db, user_id, &category)
        .await
        .map_err(|e| AppError::InternalServerError(e.to_string()))?;
    
    Ok(JsonResponse(serde_json::json!({ "success": true })))
}

/// Get current month's spending by category with budget comparison
pub async fn get_current_spending(
    Extension(state): Extension<Arc<AppState>>,
    TypedHeader(authorization): TypedHeader<Authorization<Bearer>>,
) -> Result<JsonResponse<Vec<SpendingByCategory>>> {
    let user_id = verify_jwt(authorization.token(), &state.jwt_secret)?;
    
    let spending = db::get_current_month_spending(&state.db, user_id)
        .await
        .map_err(|e| AppError::InternalServerError(e.to_string()))?;
    
    Ok(JsonResponse(spending))
}
