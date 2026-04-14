#!/usr/bin/env bash
# devctl.sh - Unified Development Control Script for BonChance
# Purpose: Single entrypoint to manage all services (backend + frontend) for local development.
# Usage: ./devctl.sh <command> [options]
# Commands:
#   up|start          Build (if needed) and start all services
#   down|stop         Stop all running services (graceful) and free ports
#   restart           Restart all services
#   status            Show detailed service + port + health status
#   logs [svc|all]    Tail logs for a single service or all (multi-pane simulation)
#   build [backend|frontend|all]  Build artifacts
#   test              Run basic health + API smoke tests via gateway
#   clean             Kill processes, remove target dist artifacts (no DB drop)
#   ports             Show processes bound to project ports
#   attach <service>  Attach interactive log follow for a service
#   quick             Start only backend (user, receipt, gateway)
#   frontend          Start only frontend
#   receipts          Create sample receipts (via gateway) for testing
#   help              Show help
#
# Services / Ports:
#   api-gateway:    3000
#   user-service:   3001
#   receipt-service:3002
#   frontend:       4200 (Angular dev) or alt fallback 38877
#
# Conventions:
# - All long-running service processes are tracked with PID files under .pids
# - Logs written to ./logs/<service>.log
# - Health endpoints are probed after start.
#
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
PID_DIR="$PROJECT_ROOT/.pids"
FRONTEND_DIR="$PROJECT_ROOT/bon-chance-frontend"
BACKEND_DIR="$PROJECT_ROOT/backend"
DATABASE_URL_DEFAULT="postgres://postgres:postgres@localhost:5432/bonchance"
JWT_SECRET_DEFAULT="dev-local-secret-change-me"

# Load .env if exists
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  source "$PROJECT_ROOT/.env"
fi

mkdir -p "$LOG_DIR" "$PID_DIR"

# Service definitions (name -> port)
declare -A PORTS=(
  [api-gateway]=3000
  [user-service]=3001
  [receipt-service]=3002
  [ocr-service]=3003
  [frontend]=4200
)

# ------------ Utility Output Formatting ------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; PURPLE='\033[0;35m'; NC='\033[0m'
log()      { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
info()     { echo -e "${PURPLE}ℹ${NC} $*"; }
success()  { echo -e "${GREEN}✓${NC} $*"; }
warn()     { echo -e "${YELLOW}⚠${NC} $*"; }
error()    { echo -e "${RED}✗${NC} $*"; }
hr()       { echo -e "${BLUE}------------------------------------------------------------${NC}"; }

# ------------ Core Helpers ------------
check_dependencies() {
  local missing=0
  for cmd in cargo npm node lsof curl; do
    if ! command -v $cmd &> /dev/null; then
      error "Missing dependency: $cmd"
      missing=1
    fi
  done
  if [[ $missing -eq 1 ]]; then
    exit 1
  fi
}

port_in_use() {
  # Try multiple methods to check if port is in use
  # Method 1: lsof (most reliable but may need sudo on some systems)
  lsof -i:"$1" > /dev/null 2>&1 && return 0
  
  # Method 2: netstat (older systems)
  netstat -tuln 2>/dev/null | grep -q ":$1 " && return 0
  
  # Method 3: ss (modern Linux)
  ss -tuln 2>/dev/null | grep -q ":$1 " && return 0
  
  # Method 4: Try to connect with curl (for HTTP services)
  if [[ "$1" == "4200" ]] || [[ "$1" == "3000" ]] || [[ "$1" == "3001" ]] || [[ "$1" == "3002" ]]; then
    curl -s --connect-timeout 1 "http://localhost:$1" > /dev/null 2>&1 && return 0
  fi
  
  return 1
}
get_pid_file() { echo "$PID_DIR/$1.pid"; }
get_log_file() { echo "$LOG_DIR/$1.log"; }

write_pid() { echo "$2" > "$(get_pid_file "$1")"; }
read_pid()  { [[ -f "$(get_pid_file "$1")" ]] && cat "$(get_pid_file "$1")" || true; }

kill_pid_safe() {
  local svc=$1; local pid=$(read_pid "$svc");
  if [[ -n "${pid}" ]] && ps -p "$pid" > /dev/null 2>&1; then
    log "Stopping $svc (PID $pid)"; kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; rm -f "$(get_pid_file "$svc")";
    success "$svc stopped"
  fi
}

kill_port_force() {
  local port=$1
  local pids=$(lsof -ti:$port 2>/dev/null || true)
  [[ -z "$pids" ]] && return 0
  warn "Force killing processes on port $port: $pids"
  for p in $pids; do kill -9 "$p" 2>/dev/null || true; done
  sleep 1  # Give OS time to release the port
}

kill_all_ng_serve() {
  # Kill all ng serve processes (including stopped/suspended ones)
  local ng_pids=$(ps aux | grep -E "ng serve|node.*angular" | grep -v grep | awk '{print $2}' || true)
  if [[ -n "$ng_pids" ]]; then
    warn "Killing orphaned ng serve processes: $ng_pids"
    for p in $ng_pids; do kill -9 "$p" 2>/dev/null || true; done
    sleep 1
  fi
}

ensure_env() {
  export DATABASE_URL="${DATABASE_URL:-$DATABASE_URL_DEFAULT}"
  export JWT_SECRET="${JWT_SECRET:-$JWT_SECRET_DEFAULT}"
}

wait_for_db() {
  log "Waiting for database..."
  local count=0
  local timeout=30
  while (( count < timeout )); do
    if pg_isready -h localhost -p 5432 >/dev/null 2>&1 || nc -z localhost 5432 >/dev/null 2>&1; then
      success "Database is ready"
      return 0
    fi
    sleep 1
    ((count++))
  done
  warn "Database check timed out. Proceeding anyway..."
}

check_health() {
  local name=$1; local url=$2; local timeout=${3:-25}; local count=0
  while (( count < timeout )); do
    if curl -sSf "$url" > /dev/null 2>&1; then success "$name healthy ($url)"; return 0; fi
    sleep 1; ((count++))
  done
  warn "$name health check timeout ($url)"
  return 1
}

show_ports() {
  hr; log "Active project ports:"; hr
  for svc in "${!PORTS[@]}"; do
    local port=${PORTS[$svc]}
    if port_in_use $port; then
      local pids=$(lsof -ti:$port | xargs)
      echo -e "${GREEN}$svc${NC} :$port (PID(s): $pids)"
    else
      echo -e "${RED}$svc${NC} :$port (frei)"
    fi
  done
  hr
}

# ------------ Build Steps ------------
build_backend() {
  log "Building backend (release opt skipped for speed)..."
  (cd "$BACKEND_DIR" && cargo build) && success "Backend build ok" || { error "Backend build failed"; return 1; }
}

build_frontend() {
  log "Building frontend..."
  (cd "$FRONTEND_DIR" && npm install --no-audit --no-fund >/dev/null 2>&1 && npm run build -- --configuration=development) && success "Frontend build ok" || { error "Frontend build failed"; return 1; }
}

# ------------ Start Services ------------
start_user_service() {
  local logf=$(get_log_file user-service)
  # Truncate log file on start
  : > "$logf"
  log "Starting user-service (3001)";
  (cd "$BACKEND_DIR/user-service" && RUST_LOG=info cargo run >> "$logf" 2>&1 & write_pid user-service $!)
  sleep 2
}

start_receipt_service() {
  local logf=$(get_log_file receipt-service)
  # Truncate log file on start
  : > "$logf"
  log "Starting receipt-service (3002)";
  (cd "$BACKEND_DIR/receipt-service" && RUST_LOG=info cargo run >> "$logf" 2>&1 & write_pid receipt-service $!)
  sleep 2
}

start_gateway() {
  local logf=$(get_log_file api-gateway)
  # Truncate log file on start
  : > "$logf"
  log "Starting api-gateway (3000)";
  (cd "$BACKEND_DIR/api-gateway" && RUST_LOG=info cargo run >> "$logf" 2>&1 & write_pid api-gateway $!)
  sleep 2
}

start_ocr_service() {
  local logf=$(get_log_file ocr-service)
  : > "$logf"
  log "Starting ocr-service (3003)";
  
  if [[ ! -d "$BACKEND_DIR/ocr-service/venv" ]]; then
    log "Creating venv for ocr-service..."
    python3 -m venv "$BACKEND_DIR/ocr-service/venv"
    "$BACKEND_DIR/ocr-service/venv/bin/pip" install -r "$BACKEND_DIR/ocr-service/requirements.txt"
  fi
  
  (cd "$BACKEND_DIR/ocr-service" && ./venv/bin/uvicorn main:app --host 0.0.0.0 --port 3003 >> "$logf" 2>&1 & write_pid ocr-service $!)
  sleep 2
}

start_frontend() {
  local logf=$(get_log_file frontend)
  # Truncate log file on start
  : > "$logf"
  log "Starting frontend (Angular dev server)";
  
  # Kill any orphaned ng serve processes first
  kill_all_ng_serve
  
  # Kill any existing process on port 4200
  if port_in_use 4200; then
    warn "Port 4200 already in use, cleaning up..."
    kill_port_force 4200
    sleep 2
  fi
  
  # Double-check port is really free
  if port_in_use 4200; then
    error "Port 4200 still in use after cleanup! Manual intervention needed."
    error "Run: lsof -ti:4200 | xargs kill -9"
    return 1
  fi
  
  # Ensure dependencies are installed
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    log "Installing frontend dependencies (first time)..."
    (cd "$FRONTEND_DIR" && npm install --no-audit --no-fund)
  fi
  
  # Start Angular dev server in background
  (cd "$FRONTEND_DIR" && nohup npm start >> "$logf" 2>&1 &)
  sleep 3
  
  # Get the actual ng serve PID (not npm wrapper)
  local ng_pid=$(ps aux | grep "[n]ode.*ng serve" | awk '{print $2}' | head -1)
  if [[ -z "$ng_pid" ]]; then
    # Fallback: try to get npm process
    ng_pid=$(ps aux | grep "[n]pm start" | grep bon-chance-frontend | grep -v grep | awk '{print $2}' | head -1)
  fi
  
  if [[ -n "$ng_pid" ]]; then
    write_pid frontend $ng_pid
    info "Frontend process started (PID: $ng_pid)"
  else
    warn "Could not find frontend PID immediately (process may still be starting)"
  fi
  
  log "Waiting for frontend to start on port 4200 (this can take 60-90 seconds)..."
  local count=0
  local max_wait=120  # Increased to 120 seconds for slow builds
  while (( count < max_wait )); do
    # Check if port is in use
    if port_in_use 4200; then
      success "Frontend is running on http://localhost:4200"
      return 0
    fi
    
    # Also check if Angular dev server reports "Local: http://localhost:4200" in logs
    if grep -q "Local:.*http://localhost:4200" "$logf" 2>/dev/null; then
      success "Frontend is ready on http://localhost:4200 (detected from logs)"
      return 0
    fi
    
    # Check if ng serve process is still alive
    if [[ -n "$ng_pid" ]] && ! ps -p $ng_pid > /dev/null 2>&1; then
      error "Frontend process died unexpectedly! Check logs:"
      tail -30 "$logf"
      return 1
    fi
    
    sleep 1
    ((count++))
    
    # Progress indicator every 15 seconds with more context
    if (( count % 15 == 0 )); then
      log "Still waiting for frontend... ($count/${max_wait}s) - Angular build in progress"
      log "Tip: You can monitor progress with: tail -f $logf"
    fi
  done
  
  warn "Frontend startup timeout after ${max_wait}s"
  warn "Frontend may still be starting. Check: tail -f $logf"
  warn "Or check port 4200: curl http://localhost:4200"
  return 1
}

start_all() {
  check_dependencies
  ensure_env
  wait_for_db
  log "Starting all services..."
  
  # Build and start backend
  build_backend || return 1
  start_user_service
  start_receipt_service
  start_ocr_service
  start_gateway
  
  # Health checks backend
  check_health "API Gateway" http://localhost:3000/health || warn "API Gateway health check failed"
  check_health "Receipt Service" http://localhost:3002/health || warn "Receipt Service health check failed"
  check_health "OCR Service" http://localhost:3003/health || warn "OCR Service health check failed"
  
  # Start frontend (non-blocking on failure)
  if start_frontend; then
    success "All services started successfully!"
    info "Backend API: http://localhost:3000"
    info "Frontend:    http://localhost:4200"
  else
    warn "Frontend failed to start, but backend is running"
    info "Backend API: http://localhost:3000"
    info "Try manually: cd bon-chance-frontend && npm start"
  fi
}

# ------------ Stop / Clean ------------
stop_all() {
  log "Stopping all services (graceful)...";
  for svc in api-gateway user-service receipt-service ocr-service frontend; do kill_pid_safe "$svc"; done
  
  # Kill all ng serve processes (including orphaned/stopped ones)
  kill_all_ng_serve
  
  # Force cleanup lingering ports
  for port in 3000 3001 3002 4200 38877; do
    port_in_use $port && kill_port_force $port || true
  done
  success "All services stopped"
}

clean() {
  stop_all
  log "Cleaning build artifacts (target, dist)";
  rm -rf "$BACKEND_DIR/target" 2>/dev/null || true
  rm -rf "$FRONTEND_DIR/dist" 2>/dev/null || true
  success "Workspace cleaned (DB unverändert)"
}

# ------------ Status / Logs / Tests ------------
status() {
  hr; log "Service Status"; hr
  for svc in api-gateway user-service receipt-service ocr-service frontend; do
    local pid=$(read_pid "$svc")
    local port=${PORTS[$svc]:-?}
    if [[ -n "$pid" ]] && ps -p "$pid" > /dev/null 2>&1; then
      echo -e "${GREEN}$svc${NC} PID:$pid PORT:$port (running)"
      # Quick health check for backend services
      case $svc in
        api-gateway)
          if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
            echo "  └─ Health: ${GREEN}✓ OK${NC}"
          else
            echo "  └─ Health: ${RED}✗ FAILED${NC}"
          fi
          ;;
        receipt-service)
          if curl -sf http://localhost:3002/health >/dev/null 2>&1; then
            echo "  └─ Health: ${GREEN}✓ OK${NC}"
          else
            echo "  └─ Health: ${RED}✗ FAILED${NC}"
          fi
          ;;
        ocr-service)
          if curl -sf http://localhost:3003/health >/dev/null 2>&1; then
            echo "  └─ Health: ${GREEN}✓ OK${NC}"
          else
            echo "  └─ Health: ${RED}✗ FAILED${NC}"
          fi
          ;;
        frontend)
          if port_in_use 4200; then
            echo "  └─ Port 4200: ${GREEN}✓ LISTENING${NC}"
          else
            echo "  └─ Port 4200: ${RED}✗ NOT LISTENING${NC}"
          fi
          ;;
      esac
    else
      if port_in_use $port; then
        local foreign_pids=$(lsof -ti:$port | xargs)
        echo -e "${YELLOW}$svc${NC} PORT:$port (foreign process: PID $foreign_pids)"
      else
        echo -e "${RED}$svc${NC} PORT:$port (stopped)"
      fi
    fi
  done
  show_ports
}

logs() {
  local target=${1:-all}
  if [[ "$target" == "all" ]]; then
    hr; log "Latest logs (tail -n 20)"; hr
    for svc in api-gateway user-service receipt-service ocr-service frontend; do
      local lf=$(get_log_file $svc)
      echo -e "--- ${PURPLE}$svc${NC} ---"
      [[ -f "$lf" ]] && tail -n 20 "$lf" || echo "(no log file)"
      echo
    done
  else
    local lf=$(get_log_file "$target")
    if [[ -f "$lf" ]]; then
      log "Tailing $target (Ctrl+C zum Beenden)"; tail -f "$lf"
    else
      error "Log file fehlt: $lf"; return 1
    fi
  fi
}

smoke_test() {
  hr; log "Running smoke tests via API Gateway"; hr
  local ok=0 fail=0
  test_endpoint() { # name, method, url, expected_substring(optional)
    local name=$1; local method=$2; local url=$3; local expect=$4
    local resp; resp=$(curl -s -X "$method" "$url" || true)
    if [[ -n "$expect" && "$resp" != *"$expect"* ]]; then
      echo -e "${RED}FAIL${NC} $name -> $url"; ((fail++))
    elif [[ -z "$resp" ]]; then
      echo -e "${RED}FAIL${NC} $name -> $url (empty)"; ((fail++))
    else
      echo -e "${GREEN}OK${NC}   $name"; ((ok++))
    fi
  }
  test_endpoint "Gateway health" GET http://localhost:3000/health healthy
  test_endpoint "Receipts list" GET http://localhost:3000/api/v1/receipts "[" # expect JSON array
  echo "Summary: $ok passed / $fail failed"
  [[ $fail -eq 0 ]] || return 1
}

# Generate a large set of sample receipts
seed_receipts() {
  if ! command -v python3 &> /dev/null; then
    error "python3 is required for seeding data."
    return 1
  fi

  log "Seeding sample receipts (last 6 months)..."
  chmod +x "$PROJECT_ROOT/scripts/seed_data.py"
  "$PROJECT_ROOT/scripts/seed_data.py"
}

usage() {
  echo "Usage: ./devctl.sh <command> [options]"
  echo "Commands:"
  echo "  up|start          Build (if needed) and start all services"
  echo "  down|stop         Stop all running services (graceful) and free ports"
  echo "  restart           Restart all services"
  echo "  status            Show detailed service + port + health status"
  echo "  logs [svc|all]    Tail logs for a single service or all"
  echo "  build [backend|frontend|all]  Build artifacts"
  echo "  test              Run basic health + API smoke tests via gateway"
  echo "  clean             Kill processes, remove target dist artifacts (no DB drop)"
  echo "  ports             Show processes bound to project ports"
  echo "  attach <service>  Attach interactive log follow for a service"
  echo "  quick             Start only backend (user, receipt, gateway)"
  echo "  frontend          Start only frontend"
  echo "  seed [receipts]   Create sample receipts for all demo users"
  echo "  clear [user...]   Delete receipts (all users or specific ones)"
  echo "  list              Show receipt counts per demo user"
  echo "  help              Show this help"
}

# Clear receipts for specific users or all
clear_receipts() {
  if ! command -v python3 &> /dev/null; then
    error "python3 is required."
    return 1
  fi
  
  local users="${*:-}"
  if [[ -n "$users" ]]; then
    log "Clearing receipts for: $users"
    python3 "$PROJECT_ROOT/scripts/seed_data.py" clear $users
  else
    log "Clearing ALL demo receipts..."
    python3 "$PROJECT_ROOT/scripts/seed_data.py" clear
  fi
}

# List receipt counts per user
list_receipts() {
  if ! command -v python3 &> /dev/null; then
    error "python3 is required."
    return 1
  fi
  python3 "$PROJECT_ROOT/scripts/seed_data.py" list
}

# ------------ Command Dispatcher ------------
cmd=${1:-help}; shift || true
case "$cmd" in
  up|start)        start_all ;;
  down|stop)       stop_all ;;
  restart)         stop_all; start_all ;;
  status)          status ;;
  logs)            logs "${1:-all}" ;;
  build)           case "${1:-all}" in backend) build_backend ;; frontend) build_frontend ;; all|*) build_backend && build_frontend ;; esac ;;
  test|smoke)      smoke_test ;;
  clean)           clean ;;
  ports)           show_ports ;;
  quick)           ensure_env; build_backend; start_user_service; start_receipt_service; start_gateway ;;
  frontend)        start_frontend ;;
  seed|receipts)   seed_receipts ;;
  clear)           clear_receipts "$@" ;;
  list)            list_receipts ;;
  attach)          logs "${1:?Service name required}" ;;
  help|--help|-h)  usage ;;
  *)               error "Unknown command: $cmd"; usage; exit 1 ;;
 esac

exit 0
