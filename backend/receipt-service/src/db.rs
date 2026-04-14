use chrono::{Datelike, Utc};
use shared::{CreateReceiptRequest, ReceiptItemResponse, ReceiptResponse, ReceiptStatus, UpdateReceiptRequest};
use sqlx::PgPool;
use uuid::Uuid;

pub async fn create_receipt(
    pool: &PgPool,
    user_id: Uuid,
    request: CreateReceiptRequest,
) -> Result<Uuid, sqlx::Error> {
    let receipt_id = Uuid::new_v4();
    let now = Utc::now();
    let purchase_date = request.purchase_date.unwrap_or(now);

    let mut tx = pool.begin().await?;

    // Create receipt
    sqlx::query!(
        r#"
        INSERT INTO receipts (id, user_id, purchase_date, total_amount, status, created_at, store_name, raw_text)
        VALUES ($1, $2, $3, $4, 'DONE', $5, $6, $7)
        "#,
        receipt_id,
        user_id,
        purchase_date,
        request.total_amount,
        now,
        request.store_name,
        request.raw_text
    )
    .execute(&mut *tx)
    .await?;

    // Create receipt items
    for item in &request.items {
        let item_id = Uuid::new_v4();

        // For Phase 0, we'll create a simple category if provided
        let category_id = if let Some(category_name) = &item.category_name {
            let category_id = Uuid::new_v4();
            sqlx::query!(
                r#"
                INSERT INTO categories (id, name) VALUES ($1, $2)
                ON CONFLICT (name) DO NOTHING
                "#,
                category_id,
                category_name
            )
            .execute(&mut *tx)
            .await?;

            // Get the category ID (either newly created or existing)
            let category = sqlx::query!("SELECT id FROM categories WHERE name = $1", category_name)
                .fetch_one(&mut *tx)
                .await?;

            Some(category.id)
        } else {
            None
        };

        sqlx::query!(
            r#"
            INSERT INTO items (id, receipt_id, description_raw, price, quantity, category_id, is_corrected_by_user)
            VALUES ($1, $2, $3, $4, $5, $6, true)
            "#,
            item_id,
            receipt_id,
            item.description,
            item.price,
            item.quantity,
            category_id
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(receipt_id)
}

pub async fn get_user_receipts(
    pool: &PgPool,
    user_id: Uuid,
    limit: i64,
    offset: i64,
) -> Result<Vec<ReceiptResponse>, sqlx::Error> {
    let receipts = sqlx::query!(
        r#"
        SELECT id, user_id, purchase_date, total_amount, status, created_at, store_name, raw_text
        FROM receipts 
        WHERE user_id = $1 
        ORDER BY purchase_date DESC
        LIMIT $2 OFFSET $3
        "#,
        user_id,
        limit,
        offset
    )
    .fetch_all(pool)
    .await?;

    let mut response = Vec::new();

    for receipt in receipts {
        let items = get_receipt_items(pool, receipt.id).await?;

        response.push(ReceiptResponse {
            id: receipt.id,
            user_id: receipt.user_id,
            purchase_date: receipt.purchase_date,
            total_amount: receipt.total_amount,
            store_name: receipt.store_name,
            raw_text: receipt.raw_text,
            status: parse_receipt_status(&receipt.status),
            created_at: receipt.created_at.unwrap_or_else(|| Utc::now()),
            items,
        });
    }

    Ok(response)
}

pub async fn get_receipt_by_id(
    pool: &PgPool,
    receipt_id: Uuid,
    user_id: Uuid,
) -> Result<Option<ReceiptResponse>, sqlx::Error> {
    let receipt = sqlx::query!(
        r#"
        SELECT id, user_id, purchase_date, total_amount, status, created_at, store_name, raw_text
        FROM receipts 
        WHERE id = $1 AND user_id = $2
        "#,
        receipt_id,
        user_id
    )
    .fetch_optional(pool)
    .await?;

    match receipt {
        Some(receipt) => {
            let items = get_receipt_items(pool, receipt_id).await?;
            Ok(Some(ReceiptResponse {
                id: receipt.id,
                user_id: receipt.user_id,
                purchase_date: receipt.purchase_date,
                total_amount: receipt.total_amount,
                store_name: receipt.store_name,
                raw_text: receipt.raw_text,
                status: parse_receipt_status(&receipt.status),
                created_at: receipt.created_at.unwrap_or_else(|| Utc::now()),
                items,
            }))
        }
        None => Ok(None),
    }
}

pub async fn delete_receipt(
    pool: &PgPool,
    receipt_id: Uuid,
    user_id: Uuid,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "DELETE FROM receipts WHERE id = $1 AND user_id = $2",
        receipt_id,
        user_id
    )
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn bulk_delete_receipts(
    pool: &PgPool,
    receipt_ids: &[Uuid],
    user_id: Uuid,
) -> Result<(), sqlx::Error> {
    if receipt_ids.is_empty() {
        return Ok(());
    }

    sqlx::query!(
        "DELETE FROM receipts WHERE id = ANY($1) AND user_id = $2",
        receipt_ids,
        user_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn update_receipt(
    pool: &PgPool,
    receipt_id: Uuid,
    user_id: Uuid,
    request: UpdateReceiptRequest,
) -> Result<Option<ReceiptResponse>, sqlx::Error> {
    let mut tx = pool.begin().await?;

    // Verify ownership and existence
    let receipt = sqlx::query!(
        "SELECT id FROM receipts WHERE id = $1 AND user_id = $2",
        receipt_id,
        user_id
    )
    .fetch_optional(&mut *tx)
    .await?;

    if receipt.is_none() {
        return Ok(None);
    }

    // Update fields if present
    if let Some(purchase_date) = request.purchase_date {
        sqlx::query!(
            "UPDATE receipts SET purchase_date = $1 WHERE id = $2",
            purchase_date,
            receipt_id
        )
        .execute(&mut *tx)
        .await?;
    }

    if let Some(total_amount) = request.total_amount {
        sqlx::query!(
            "UPDATE receipts SET total_amount = $1 WHERE id = $2",
            total_amount,
            receipt_id
        )
        .execute(&mut *tx)
        .await?;
    }

    if let Some(store_name) = request.store_name {
        sqlx::query!(
            "UPDATE receipts SET store_name = $1 WHERE id = $2",
            store_name,
            receipt_id
        )
        .execute(&mut *tx)
        .await?;
    }

    if let Some(items) = &request.items {
        // Delete existing items
        sqlx::query!(
            "DELETE FROM items WHERE receipt_id = $1",
            receipt_id
        )
        .execute(&mut *tx)
        .await?;

        // Insert new items
        for item in items {
            let item_id = Uuid::new_v4();

            // Handle category
            let category_id = if let Some(category_name) = &item.category_name {
                let category_id = Uuid::new_v4();
                sqlx::query!(
                    r#"
                    INSERT INTO categories (id, name) VALUES ($1, $2)
                    ON CONFLICT (name) DO NOTHING
                    "#,
                    category_id,
                    category_name
                )
                .execute(&mut *tx)
                .await?;

                let category = sqlx::query!("SELECT id FROM categories WHERE name = $1", category_name)
                    .fetch_one(&mut *tx)
                    .await?;

                Some(category.id)
            } else {
                None
            };

            sqlx::query!(
                r#"
                INSERT INTO items (id, receipt_id, description_raw, price, quantity, category_id, is_corrected_by_user)
                VALUES ($1, $2, $3, $4, $5, $6, true)
                "#,
                item_id,
                receipt_id,
                item.description,
                item.price,
                item.quantity,
                category_id
            )
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    // We need to fetch the updated receipt to return it. 
    // Since we are inside the db module, we can call get_receipt_by_id but we need to pass the pool, not the transaction.
    // The transaction is committed, so it's safe to use the pool.
    get_receipt_by_id(pool, receipt_id, user_id).await
}

async fn get_receipt_items(
    pool: &PgPool,
    receipt_id: Uuid,
) -> Result<Vec<ReceiptItemResponse>, sqlx::Error> {
    let items = sqlx::query!(
        r#"
        SELECT i.id, i.description_raw, i.price, i.quantity, i.is_corrected_by_user, i.confidence_score, c.name as "category_name?"
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE i.receipt_id = $1
        ORDER BY i.id
        "#,
        receipt_id
    )
    .fetch_all(pool)
    .await?;

    Ok(items
        .into_iter()
        .map(|item| ReceiptItemResponse {
            id: item.id,
            description: item.description_raw,
            price: item.price,
            quantity: item.quantity,
            category_name: item.category_name,
            is_corrected_by_user: item.is_corrected_by_user.unwrap_or(false),
            confidence_score: item.confidence_score,
        })
        .collect())
}

fn parse_receipt_status(status: &str) -> ReceiptStatus {
    match status {
        "PENDING" => ReceiptStatus::Pending,
        "PROCESSING" => ReceiptStatus::Processing,
        "DONE" => ReceiptStatus::Done,
        "FAILED" => ReceiptStatus::Failed,
        "NEEDS_REVIEW" => ReceiptStatus::NeedsReview,
        _ => ReceiptStatus::Done,
    }
}

// ============================================================================
// Budget Database Functions
// ============================================================================

use crate::handlers::{BudgetResponse, SpendingByCategory};
use rust_decimal::Decimal;

pub async fn get_user_budgets(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<Vec<BudgetResponse>, sqlx::Error> {
    // Get current month's start and end dates
    let now = Utc::now();
    let month_start = now.date_naive().with_day(1).unwrap().and_hms_opt(0, 0, 0).unwrap().and_utc();
    let month_end = now;

    // Get all budgets with current spending
    let rows = sqlx::query!(
        r#"
        SELECT 
            b.id,
            b.category_name,
            b.monthly_limit,
            COALESCE(
                (SELECT SUM(i.price * i.quantity)
                 FROM items i
                 JOIN receipts r ON i.receipt_id = r.id
                 JOIN categories c ON i.category_id = c.id
                 WHERE r.user_id = $1 
                   AND r.purchase_date >= $2 
                   AND r.purchase_date <= $3
                   AND c.name = b.category_name),
                0
            ) as current_spending
        FROM budgets b
        WHERE b.user_id = $1
        ORDER BY b.category_name
        "#,
        user_id,
        month_start,
        month_end
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let current_spending = row.current_spending.unwrap_or(Decimal::ZERO);
            let percentage = if row.monthly_limit > Decimal::ZERO {
                (current_spending / row.monthly_limit * Decimal::from(100)).to_string().parse::<f64>().unwrap_or(0.0)
            } else {
                0.0
            };
            BudgetResponse {
                id: row.id,
                category_name: row.category_name,
                monthly_limit: row.monthly_limit,
                current_spending,
                percentage_used: percentage,
            }
        })
        .collect())
}

pub async fn get_budget_by_category(
    pool: &PgPool,
    user_id: Uuid,
    category_name: &str,
) -> Result<Option<BudgetResponse>, sqlx::Error> {
    let now = Utc::now();
    let month_start = now.date_naive().with_day(1).unwrap().and_hms_opt(0, 0, 0).unwrap().and_utc();
    let month_end = now;

    let row = sqlx::query!(
        r#"
        SELECT 
            b.id,
            b.category_name,
            b.monthly_limit,
            COALESCE(
                (SELECT SUM(i.price * i.quantity)
                 FROM items i
                 JOIN receipts r ON i.receipt_id = r.id
                 JOIN categories c ON i.category_id = c.id
                 WHERE r.user_id = $1 
                   AND r.purchase_date >= $2 
                   AND r.purchase_date <= $3
                   AND c.name = b.category_name),
                0
            ) as current_spending
        FROM budgets b
        WHERE b.user_id = $1 AND b.category_name = $4
        "#,
        user_id,
        month_start,
        month_end,
        category_name
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| {
        let current_spending = r.current_spending.unwrap_or(Decimal::ZERO);
        let percentage = if r.monthly_limit > Decimal::ZERO {
            (current_spending / r.monthly_limit * Decimal::from(100)).to_string().parse::<f64>().unwrap_or(0.0)
        } else {
            0.0
        };
        BudgetResponse {
            id: r.id,
            category_name: r.category_name,
            monthly_limit: r.monthly_limit,
            current_spending,
            percentage_used: percentage,
        }
    }))
}

pub async fn upsert_budget(
    pool: &PgPool,
    user_id: Uuid,
    category_name: &str,
    monthly_limit: Decimal,
) -> Result<BudgetResponse, sqlx::Error> {
    let budget_id = Uuid::new_v4();
    let now = Utc::now();

    let row = sqlx::query!(
        r#"
        INSERT INTO budgets (id, user_id, category_name, monthly_limit, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $5)
        ON CONFLICT (user_id, category_name) 
        DO UPDATE SET monthly_limit = $4, updated_at = $5
        RETURNING id, category_name, monthly_limit
        "#,
        budget_id,
        user_id,
        category_name,
        monthly_limit,
        now
    )
    .fetch_one(pool)
    .await?;

    // Get current spending for this category
    let month_start = now.date_naive().with_day(1).unwrap().and_hms_opt(0, 0, 0).unwrap().and_utc();
    
    let spending = sqlx::query_scalar!(
        r#"
        SELECT COALESCE(SUM(i.price * i.quantity), 0) as "total!"
        FROM items i
        JOIN receipts r ON i.receipt_id = r.id
        JOIN categories c ON i.category_id = c.id
        WHERE r.user_id = $1 
          AND r.purchase_date >= $2 
          AND r.purchase_date <= $3
          AND c.name = $4
        "#,
        user_id,
        month_start,
        now,
        category_name
    )
    .fetch_one(pool)
    .await?;

    let percentage = if row.monthly_limit > Decimal::ZERO {
        (spending / row.monthly_limit * Decimal::from(100)).to_string().parse::<f64>().unwrap_or(0.0)
    } else {
        0.0
    };

    Ok(BudgetResponse {
        id: row.id,
        category_name: row.category_name,
        monthly_limit: row.monthly_limit,
        current_spending: spending,
        percentage_used: percentage,
    })
}

pub async fn delete_budget(
    pool: &PgPool,
    user_id: Uuid,
    category_name: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"DELETE FROM budgets WHERE user_id = $1 AND category_name = $2"#,
        user_id,
        category_name
    )
    .execute(pool)
    .await?;
    
    Ok(())
}

pub async fn get_current_month_spending(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<Vec<SpendingByCategory>, sqlx::Error> {
    let now = Utc::now();
    let month_start = now.date_naive().with_day(1).unwrap().and_hms_opt(0, 0, 0).unwrap().and_utc();

    let rows = sqlx::query!(
        r#"
        SELECT 
            COALESCE(c.name, 'Sonstiges') as category_name,
            SUM(i.price * i.quantity) as total_spent,
            b.monthly_limit as "budget_limit?"
        FROM items i
        JOIN receipts r ON i.receipt_id = r.id
        LEFT JOIN categories c ON i.category_id = c.id
        LEFT JOIN budgets b ON b.user_id = r.user_id AND b.category_name = COALESCE(c.name, 'Sonstiges')
        WHERE r.user_id = $1 
          AND r.purchase_date >= $2 
          AND r.purchase_date <= $3
        GROUP BY COALESCE(c.name, 'Sonstiges'), b.monthly_limit
        ORDER BY total_spent DESC
        "#,
        user_id,
        month_start,
        now
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let total_spent = row.total_spent.unwrap_or(Decimal::ZERO);
            let percentage = row.budget_limit.map(|limit| {
                if limit > Decimal::ZERO {
                    (total_spent / limit * Decimal::from(100)).to_string().parse::<f64>().unwrap_or(0.0)
                } else {
                    0.0
                }
            });
            SpendingByCategory {
                category_name: row.category_name.unwrap_or_else(|| "Sonstiges".to_string()),
                total_spent,
                budget_limit: row.budget_limit,
                percentage_used: percentage,
            }
        })
        .collect())
}
