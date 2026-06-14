//! http_server.rs — Lightweight Axum HTTP server for programmatic control.
//!
//! Start with: `cargo run -- --serve` (default port 8765)
//! Or set PUMP_HTTP_PORT env var.
//!
//! Endpoints:
//!   POST /buy        { "mint": "...", "sol": 0.05 }
//!   POST /balance    {}
//!   POST /wrap       { "sol": 0.1 }   (optional sol field)
//!   POST /unwrap     {}
//!   POST /close      {}
//!   GET  /tokens     — tracked token status
//!   POST /risk-check {}
//!   GET  /health     — server liveness
//!   GET  /status     — secret-safe live gate/status summary

use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::process::Command;

#[derive(Clone)]
pub struct AppState {
    pub binary_path: String,
    pub cwd: String,
}

#[derive(Serialize)]
pub struct ApiResponse {
    pub success: bool,
    pub output: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Deserialize)]
pub struct BuyRequest {
    pub mint: String,
    pub sol: f64,
}

#[derive(Deserialize)]
pub struct WrapRequest {
    pub sol: Option<f64>,
}

#[derive(Serialize)]
pub struct StatusResponse {
    pub service: &'static str,
    pub live_trading_enabled: bool,
    pub pump_dry_run: bool,
    pub live_http_enabled: bool,
    pub max_trade_sol: Option<String>,
    pub auto_buy_amount_sol: Option<String>,
    pub counter_limit: Option<String>,
    pub risk_management_enabled: bool,
    pub rpc_http_present: bool,
    pub yellowstone_grpc_http_present: bool,
    pub yellowstone_grpc_token_present: bool,
    pub private_key_present: bool,
    pub pump_http_port: String,
}

// ---------------------------------------------------------------------------
// Command runner
// ---------------------------------------------------------------------------

async fn run_pump(state: &AppState, args: &[&str]) -> ApiResponse {
    let mut cmd = Command::new(&state.binary_path);
    cmd.args(args).current_dir(&state.cwd);

    match cmd.output().await {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            ApiResponse {
                success: out.status.success(),
                output: stdout,
                error: if stderr.is_empty() { None } else { Some(stderr) },
            }
        }
        Err(e) => ApiResponse {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        },
    }
}

fn env_flag(key: &str, default: bool) -> bool {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse::<bool>().ok())
        .unwrap_or(default)
}

fn live_http_enabled() -> bool {
    env_flag("LIVE_TRADING_ENABLED", false) && !env_flag("PUMP_DRY_RUN", true)
}

fn blocked_live_response(action: &str) -> ApiResponse {
    ApiResponse {
        success: false,
        output: String::new(),
        error: Some(format!(
            "{} blocked: set LIVE_TRADING_ENABLED=true and PUMP_DRY_RUN=false before exposing live HTTP control",
            action
        )),
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok", "service": "clawd-pump" }))
}

fn env_present(key: &str) -> bool {
    std::env::var(key)
        .ok()
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
}

fn env_string(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .filter(|v| !v.trim().is_empty())
}

async fn status() -> Json<StatusResponse> {
    Json(StatusResponse {
        service: "clawd-pump",
        live_trading_enabled: env_flag("LIVE_TRADING_ENABLED", false),
        pump_dry_run: env_flag("PUMP_DRY_RUN", true),
        live_http_enabled: live_http_enabled(),
        max_trade_sol: env_string("MAX_TRADE_SOL"),
        auto_buy_amount_sol: env_string("AUTO_BUY_AMOUNT_SOL"),
        counter_limit: env_string("COUNTER_LIMIT"),
        risk_management_enabled: env_flag("RISK_MANAGEMENT_ENABLED", false),
        rpc_http_present: env_present("RPC_HTTP"),
        yellowstone_grpc_http_present: env_present("YELLOWSTONE_GRPC_HTTP"),
        yellowstone_grpc_token_present: env_present("YELLOWSTONE_GRPC_TOKEN"),
        private_key_present: env_present("PRIVATE_KEY"),
        pump_http_port: std::env::var("PUMP_HTTP_PORT").unwrap_or_else(|_| "8765".to_string()),
    })
}

async fn buy(
    State(state): State<Arc<AppState>>,
    Json(body): Json<BuyRequest>,
) -> (StatusCode, Json<ApiResponse>) {
    if !live_http_enabled() {
        return (StatusCode::FORBIDDEN, Json(blocked_live_response("buy")));
    }
    let sol_str = body.sol.to_string();
    let result = run_pump(&state, &["--buy", &body.mint, &sol_str]).await;
    let status = if result.success { StatusCode::OK } else { StatusCode::BAD_REQUEST };
    (status, Json(result))
}

async fn balance(State(state): State<Arc<AppState>>) -> Json<ApiResponse> {
    if !live_http_enabled() {
        return Json(blocked_live_response("balance rebalance"));
    }
    Json(run_pump(&state, &["--balance"]).await)
}

async fn wrap(
    State(state): State<Arc<AppState>>,
    Json(body): Json<WrapRequest>,
) -> Json<ApiResponse> {
    if !live_http_enabled() {
        return Json(blocked_live_response("wrap"));
    }
    let result = if let Some(amount) = body.sol {
        let amt = amount.to_string();
        run_pump(&state, &["--wrap", &amt]).await
    } else {
        run_pump(&state, &["--wrap"]).await
    };
    Json(result)
}

async fn unwrap(State(state): State<Arc<AppState>>) -> Json<ApiResponse> {
    if !live_http_enabled() {
        return Json(blocked_live_response("unwrap"));
    }
    Json(run_pump(&state, &["--unwrap"]).await)
}

async fn close(State(state): State<Arc<AppState>>) -> Json<ApiResponse> {
    if !live_http_enabled() {
        return Json(blocked_live_response("close"));
    }
    Json(run_pump(&state, &["--close"]).await)
}

async fn check_tokens(State(state): State<Arc<AppState>>) -> Json<ApiResponse> {
    Json(run_pump(&state, &["--check-tokens"]).await)
}

async fn risk_check(State(state): State<Arc<AppState>>) -> Json<ApiResponse> {
    if !live_http_enabled() {
        return Json(blocked_live_response("risk-check"));
    }
    Json(run_pump(&state, &["--risk-check"]).await)
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

pub async fn serve(binary_path: String, cwd: String) -> anyhow::Result<()> {
    let port: u16 = std::env::var("PUMP_HTTP_PORT")
        .unwrap_or_else(|_| "8765".to_string())
        .parse()
        .unwrap_or(8765);

    let state = Arc::new(AppState { binary_path, cwd });

    let app = Router::new()
        .route("/health", get(health))
        .route("/status", get(status))
        .route("/buy", post(buy))
        .route("/balance", post(balance))
        .route("/wrap", post(wrap))
        .route("/unwrap", post(unwrap))
        .route("/close", post(close))
        .route("/tokens", get(check_tokens))
        .route("/risk-check", post(risk_check))
        .with_state(state);

    let addr = format!("0.0.0.0:{port}");
    println!("[clawd-pump] HTTP server listening on {addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
