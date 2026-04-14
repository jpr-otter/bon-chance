use axum::{
    body::Body,
    extract::Request,
    http::{HeaderValue, StatusCode},
    response::{Json, Response},
    routing::{any, get},
    Router,
};
use serde_json::{json, Value};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing_appender::rolling;
use tracing_subscriber::fmt::writer::MakeWriterExt;

#[tokio::main]

async fn main() -> anyhow::Result<()> {
    // File-Logger einrichten
    let file_appender = rolling::daily("/home/jrotter/projects/bon-chance/logs", "api-gateway.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);
    tracing_subscriber::fmt()
        .with_writer(non_blocking.and(std::io::stdout))
        .init();

    let user_service_url =
        std::env::var("USER_SERVICE_URL").unwrap_or_else(|_| "http://localhost:3001".to_string());
    let receipt_service_url = std::env::var("RECEIPT_SERVICE_URL")
        .unwrap_or_else(|_| "http://localhost:3002".to_string());

    let state = Arc::new(GatewayState {
        user_service_url,
        receipt_service_url,
    });

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/admin/*path", any(proxy_admin))
        .route("/api/v1/users/*path", any(proxy_users))
        .route("/api/v1/users", any(proxy_users))
        .route("/api/v1/user/*path", any(proxy_user))
        .route("/api/v1/user", any(proxy_user))
        .route("/api/v1/receipts/*path", any(proxy_receipts))
        .route("/api/v1/receipts", any(proxy_receipts))
        .route("/api/v1/budgets/*path", any(proxy_budgets))
        .route("/api/v1/budgets", any(proxy_budgets))
        .route("/api/v1/spending/*path", any(proxy_spending))
        .with_state(state)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        );

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    println!("🚪 API Gateway listening on http://0.0.0.0:3000");

    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "healthy",
        "service": "api-gateway"
    }))
}

#[derive(Clone)]
struct GatewayState {
    user_service_url: String,
    receipt_service_url: String,
}

async fn proxy_users(
    state: axum::extract::State<Arc<GatewayState>>,
    req: Request,
) -> Result<Response, StatusCode> {
    proxy_generic(&state.user_service_url, "/api/v1/users", req).await
}

async fn proxy_user(
    state: axum::extract::State<Arc<GatewayState>>,
    req: Request,
) -> Result<Response, StatusCode> {
    proxy_generic(&state.user_service_url, "/api/v1/user", req).await
}

async fn proxy_budgets(
    state: axum::extract::State<Arc<GatewayState>>,
    req: Request,
) -> Result<Response, StatusCode> {
    // Map /api/v1/budgets/* to /budgets/* on the receipt service
    proxy_to_receipt_service(&state.receipt_service_url, "/api/v1/budgets", "/budgets", req).await
}

async fn proxy_spending(
    state: axum::extract::State<Arc<GatewayState>>,
    req: Request,
) -> Result<Response, StatusCode> {
    // Map /api/v1/spending/* to /budgets/spending/* on the receipt service
    proxy_to_receipt_service(&state.receipt_service_url, "/api/v1/spending", "/budgets/spending", req).await
}

async fn proxy_receipts(
    state: axum::extract::State<Arc<GatewayState>>,
    req: Request,
) -> Result<Response, StatusCode> {
    // Map /api/v1/receipts to /receipts on the receipt service
    let uri = req.uri().clone();
    let path = uri.path();

    // IMPORTANT: Extract headers BEFORE consuming the request body
    let headers = req.headers().clone();

    // Convert /api/v1/receipts/* to /receipts/*
    let target_path = if path == "/api/v1/receipts" {
        "/receipts".to_string()
    } else if let Some(suffix) = path.strip_prefix("/api/v1/receipts") {
        format!("/receipts{}", suffix)
    } else {
        path.to_string()
    };

    let target_url = if let Some(query) = uri.query() {
        format!("{}{}?{}", state.receipt_service_url, target_path, query)
    } else {
        format!("{}{}", state.receipt_service_url, target_path)
    };

    // Use a simplified direct proxy call

    // Use the existing proxy_generic but with corrected target URL
    let method = req.method().clone();
    let body_bytes = axum::body::to_bytes(req.into_body(), 2 * 1024 * 1024)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let client = reqwest::Client::new();

    // Convert axum Method to reqwest Method
    let reqwest_method = match method.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        _ => reqwest::Method::GET,
    };

    let mut rb = client.request(reqwest_method, &target_url);

    // Forward Authorization header if present
    if let Some(auth) = headers.get("authorization") {
        if let Ok(auth_str) = auth.to_str() {
            rb = rb.header("Authorization", auth_str);
        }
    }

    // Forward Content-Type header if present, otherwise default to application/json
    if !body_bytes.is_empty() {
        if let Some(content_type) = headers.get("content-type") {
            rb = rb.header("Content-Type", content_type.as_bytes());
        } else {
            rb = rb.header("Content-Type", "application/json");
        }
        rb = rb.body(body_bytes);
    }
    let resp = rb.send().await.map_err(|e| {
        eprintln!("Proxy request failed: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    // Convert reqwest::StatusCode to axum::http::StatusCode
    let status_code = resp.status().as_u16();
    let axum_status =
        StatusCode::from_u16(status_code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let bytes = resp.bytes().await.map_err(|_| StatusCode::BAD_GATEWAY)?;

    let mut response = Response::builder().status(axum_status);
    response
        .headers_mut()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?
        .insert(
            axum::http::header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );

    response
        .body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

// Helper to proxy to receipt service with path remapping
async fn proxy_to_receipt_service(
    base_url: &str,
    from_prefix: &str,
    to_prefix: &str,
    req: Request,
) -> Result<Response, StatusCode> {
    let method = req.method().clone();
    let headers = req.headers().clone();
    let original_uri = req.uri().clone();
    let path = original_uri.path();

    // Remap the path: /api/v1/budgets/foo -> /budgets/foo
    let target_path = if path == from_prefix {
        to_prefix.to_string()
    } else if let Some(suffix) = path.strip_prefix(from_prefix) {
        format!("{}{}", to_prefix, suffix)
    } else {
        path.to_string()
    };

    let target_url = if let Some(query) = original_uri.query() {
        format!("{}{}?{}", base_url, target_path, query)
    } else {
        format!("{}{}", base_url, target_path)
    };

    eprintln!("[DEBUG] proxy_to_receipt_service: {} -> {}", path, target_url);

    let body_bytes = axum::body::to_bytes(req.into_body(), 2 * 1024 * 1024)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let client = reqwest::Client::new();
    let reqwest_method = match method.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        _ => reqwest::Method::GET,
    };

    let mut rb = client.request(reqwest_method, &target_url);

    // Forward Authorization header
    if let Some(auth) = headers.get("authorization") {
        if let Ok(auth_str) = auth.to_str() {
            rb = rb.header("Authorization", auth_str);
        }
    }

    // Forward Content-Type header if present
    if !body_bytes.is_empty() {
        if let Some(content_type) = headers.get("content-type") {
            rb = rb.header("Content-Type", content_type.as_bytes());
        } else {
            rb = rb.header("Content-Type", "application/json");
        }
        rb = rb.body(body_bytes);
    }

    let resp = rb.send().await.map_err(|e| {
        eprintln!("Proxy request to receipt service failed: {}", e);
        StatusCode::BAD_GATEWAY
    })?;

    let status_code = resp.status().as_u16();
    let axum_status = StatusCode::from_u16(status_code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let bytes = resp.bytes().await.map_err(|_| StatusCode::BAD_GATEWAY)?;

    let mut response = Response::builder().status(axum_status);
    response
        .headers_mut()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?
        .insert(
            axum::http::header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );

    response
        .body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn proxy_generic(base_url: &str, prefix: &str, req: Request) -> Result<Response, StatusCode> {
    let method = req.method().clone();
    let headers = req.headers().clone(); // Clone headers from original request
    let original_uri = req.uri().clone();
    let path_and_query = original_uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");
    let trimmed = path_and_query
        .strip_prefix(prefix)
        .unwrap_or(path_and_query);
    let final_path = if trimmed.is_empty() { "/" } else { trimmed };
    let target_url = format!("{}{}", base_url, final_path);

    let body_bytes = axum::body::to_bytes(req.into_body(), 2 * 1024 * 1024)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let client = reqwest::Client::new();

    // Convert axum Method to reqwest Method
    let reqwest_method = match method.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        _ => reqwest::Method::GET,
    };

    let mut rb = client.request(reqwest_method, &target_url);

    // Forward important headers (Authorization, Content-Type, etc.)
    eprintln!("[DEBUG] Original request has {} headers", headers.len());
    for (name, value) in headers.iter() {
        eprintln!("[DEBUG] Header: {} = {:?}", name, value);
    }

    if let Some(auth) = headers.get("authorization") {
        if let Ok(auth_str) = auth.to_str() {
            eprintln!("[DEBUG] Forwarding Authorization header: {}", auth_str);
            rb = rb.header("Authorization", auth_str);
        } else {
            eprintln!("[DEBUG] Authorization header found but to_str() failed");
        }
    } else {
        eprintln!("[DEBUG] No authorization header found in request");
    }

    // Forward Content-Type header if present, otherwise default to application/json
    if !body_bytes.is_empty() {
        if let Some(content_type) = headers.get("content-type") {
            rb = rb.header("Content-Type", content_type.as_bytes());
        } else {
            rb = rb.header("Content-Type", "application/json");
        }
        rb = rb.body(body_bytes);
    }

    let resp = rb.send().await.map_err(|e| {
        eprintln!("Proxy request failed: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let status = resp.status();
    let bytes = resp.bytes().await.map_err(|_| StatusCode::BAD_GATEWAY)?;

    // Convert reqwest::StatusCode to axum::http::StatusCode
    let status_code = status.as_u16();
    let axum_status =
        StatusCode::from_u16(status_code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

    let mut response = Response::builder().status(axum_status);
    response
        .headers_mut()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?
        .insert(
            axum::http::header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );

    response
        .body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn proxy_admin(
    state: axum::extract::State<Arc<GatewayState>>,
    req: Request,
) -> Result<Response, StatusCode> {
    let method = req.method().clone();
    let original_uri = req.uri().clone();
    let path_and_query = original_uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");

    // For admin routes, we need to map /api/v1/admin/* to /admin/* on the user service
    let target_path = if let Some(suffix) = path_and_query.strip_prefix("/api/v1/admin") {
        format!("/admin{}", suffix)
    } else {
        path_and_query.to_string()
    };

    let target_url = format!("{}{}", state.user_service_url, target_path);

    // Get headers from the original request
    let headers = req.headers().clone();
    let body_bytes = axum::body::to_bytes(req.into_body(), 2 * 1024 * 1024)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let client = reqwest::Client::new();

    // Convert axum Method to reqwest Method
    let reqwest_method = match method.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        _ => reqwest::Method::GET,
    };

    let mut rb = client.request(reqwest_method, &target_url);

    // Forward Authorization header
    if let Some(auth) = headers.get("Authorization") {
        if let Ok(auth_str) = auth.to_str() {
            rb = rb.header("Authorization", auth_str);
        }
    }

    // Forward Content-Type header if present, otherwise default to application/json
    if !body_bytes.is_empty() {
        if let Some(content_type) = headers.get("content-type") {
            rb = rb.header("Content-Type", content_type.as_bytes());
        } else {
            rb = rb.header("Content-Type", "application/json");
        }
        rb = rb.body(body_bytes);
    }

    let response = rb.send().await.map_err(|e| {
        tracing::error!("Error forwarding admin request: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let axum_status = match status.as_u16() {
        200 => StatusCode::OK,
        201 => StatusCode::CREATED,
        400 => StatusCode::BAD_REQUEST,
        401 => StatusCode::UNAUTHORIZED,
        403 => StatusCode::FORBIDDEN,
        404 => StatusCode::NOT_FOUND,
        500 => StatusCode::INTERNAL_SERVER_ERROR,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };

    let mut response = Response::builder().status(axum_status);
    response
        .headers_mut()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?
        .insert(
            axum::http::header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );

    response
        .body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
