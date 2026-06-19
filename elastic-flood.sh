#!/bin/bash
# elastic-flood.sh — Generate logs and metrics flood for Elastic Agent testing

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Defaults ─────────────────────────────────────────────────────────────────
LOG_COUNT=1000
LOG_DELAY=0.05        # seconds between log entries
CPU_DURATION=60       # seconds of CPU stress
MEM_SIZE="256M"       # memory per worker
CPU_WORKERS=4
RUN_LOGS=true
RUN_CPU=true
RUN_MEM=true

# ── Usage ─────────────────────────────────────────────────────────────────────
usage() {
  echo -e "${BOLD}Usage:${RESET} $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --logs-only        Only generate log flood"
  echo "  --metrics-only     Only generate CPU/memory stress"
  echo "  --log-count N      Number of log entries (default: $LOG_COUNT)"
  echo "  --log-delay S      Delay between logs in seconds (default: $LOG_DELAY)"
  echo "  --cpu-duration S   CPU stress duration in seconds (default: $CPU_DURATION)"
  echo "  --cpu-workers N    Number of CPU workers (default: $CPU_WORKERS)"
  echo "  --mem-size SIZE    Memory per worker e.g. 256M, 1G (default: $MEM_SIZE)"
  echo "  -h, --help         Show this help"
  exit 0
}

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --logs-only)    RUN_CPU=false; RUN_MEM=false ;;
    --metrics-only) RUN_LOGS=false ;;
    --log-count)    LOG_COUNT=$2; shift ;;
    --log-delay)    LOG_DELAY=$2; shift ;;
    --cpu-duration) CPU_DURATION=$2; shift ;;
    --cpu-workers)  CPU_WORKERS=$2; shift ;;
    --mem-size)     MEM_SIZE=$2; shift ;;
    -h|--help)      usage ;;
    *) echo -e "${RED}Unknown option: $1${RESET}"; usage ;;
  esac
  shift
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
header()  { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${RESET}"; }

cleanup() {
  echo -e "\n${YELLOW}[CLEANUP]${RESET} Stopping background jobs..."
  jobs -p | xargs -r kill 2>/dev/null || true
  success "Done."
}
trap cleanup EXIT INT TERM

# ── Log levels and services for variety ──────────────────────────────────────
LEVELS=("INFO" "WARN" "ERROR" "DEBUG" "CRITICAL")
SERVICES=("auth" "kernel" "systemd" "nginx" "postgres" "sshd" "cron" "app")
MESSAGES=(
  "Connection established from 192.168.1.$((RANDOM % 255))"
  "Failed login attempt for user admin"
  "Disk usage at $((RANDOM % 40 + 60))% on /dev/sda1"
  "Service restarted after health check failure"
  "Request timeout after 30s on endpoint /api/v1/data"
  "Memory threshold exceeded: $((RANDOM % 20 + 80))% used"
  "SSL certificate expires in $((RANDOM % 30)) days"
  "Database connection pool exhausted"
  "Rate limit triggered for IP 10.0.0.$((RANDOM % 255))"
  "Config reload triggered by SIGHUP"
  "Backup completed successfully in $((RANDOM % 120 + 10))s"
  "New user session opened: session_id=$RANDOM"
)

# ══════════════════════════════════════════════════════════════════════════════
# LOGS FLOOD
# ══════════════════════════════════════════════════════════════════════════════
run_log_flood() {
  header "LOG FLOOD"
  info "Sending $LOG_COUNT syslog entries (delay: ${LOG_DELAY}s between each)..."
  info "These will appear in Discover under: data_stream.dataset = system.syslog / system.auth"
  echo ""

  local start=$SECONDS
  local count=0

  for i in $(seq 1 "$LOG_COUNT"); do
    local level=${LEVELS[$((RANDOM % ${#LEVELS[@]}))]}
    local service=${SERVICES[$((RANDOM % ${#SERVICES[@]}))]}
    local msg=${MESSAGES[$((RANDOM % ${#MESSAGES[@]}))]}

    # Mix of regular syslog and auth log entries
    if (( i % 10 == 0 )); then
      logger -t "sshd" -p auth.info "elastic-flood: $level [$i/$LOG_COUNT] Accepted publickey for testuser from 192.168.1.$((RANDOM % 255)) port $((RANDOM % 60000 + 1024))"
    else
      logger -t "elastic-flood-$service" "$level [$i/$LOG_COUNT] $msg"
    fi

    count=$((count + 1))

    # Progress every 100 entries
    if (( i % 100 == 0 )); then
      echo -e "  ${GREEN}✓${RESET} $i / $LOG_COUNT entries sent..."
    fi

    sleep "$LOG_DELAY"
  done

  local elapsed=$((SECONDS - start))
  success "Log flood complete: $count entries in ${elapsed}s"
  info "Check Discover with filter: log.file.path : \"/var/log/syslog\" or tags : \"elastic-flood*\""
}

# ══════════════════════════════════════════════════════════════════════════════
# CPU STRESS
# ══════════════════════════════════════════════════════════════════════════════
run_cpu_stress() {
  header "CPU STRESS"

  if command -v stress-ng &>/dev/null; then
    info "Using stress-ng for CPU stress ($CPU_WORKERS workers, ${CPU_DURATION}s)..."
    stress-ng --cpu "$CPU_WORKERS" --timeout "${CPU_DURATION}s" --metrics-brief
    success "stress-ng CPU stress complete."
  else
    warn "stress-ng not found — using pure bash CPU burn instead."
    warn "Install with: sudo apt-get install -y stress-ng"
    info "Starting $CPU_WORKERS bash CPU workers for ${CPU_DURATION}s..."

    local pids=()
    for i in $(seq 1 "$CPU_WORKERS"); do
      (while true; do :; done) &
      pids+=($!)
      info "  CPU worker $i started (pid ${pids[-1]})"
    done

    echo ""
    info "Burning CPU for ${CPU_DURATION}s..."
    sleep "$CPU_DURATION"

    for pid in "${pids[@]}"; do
      kill "$pid" 2>/dev/null || true
    done
    success "CPU stress complete (${CPU_DURATION}s)."
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# MEMORY STRESS
# ══════════════════════════════════════════════════════════════════════════════
run_mem_stress() {
  header "MEMORY STRESS"

  if command -v stress-ng &>/dev/null; then
    info "Using stress-ng for memory stress (2 workers × $MEM_SIZE, ${CPU_DURATION}s)..."
    stress-ng --vm 2 --vm-bytes "$MEM_SIZE" --timeout "${CPU_DURATION}s"
    success "Memory stress complete."
  else
    warn "stress-ng not found — skipping memory stress (install: sudo apt-get install -y stress-ng)"
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════
echo -e "${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║   Elastic Agent — Flood Generator     ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${RESET}"
echo -e "  Logs flood  : ${BOLD}$RUN_LOGS${RESET} ($LOG_COUNT entries)"
echo -e "  CPU stress  : ${BOLD}$RUN_CPU${RESET} ($CPU_WORKERS workers × ${CPU_DURATION}s)"
echo -e "  Mem stress  : ${BOLD}$RUN_MEM${RESET} (2 workers × $MEM_SIZE)"
echo ""

$RUN_LOGS && run_log_flood
$RUN_CPU  && run_cpu_stress
$RUN_MEM  && run_mem_stress

echo ""
echo -e "${BOLD}${GREEN}━━━ All done! ━━━${RESET}"
echo ""
echo -e "Now check Kibana Discover with these filters:"
echo -e "  ${CYAN}data_stream.dataset : \"system.syslog\"${RESET}   → syslog entries"
echo -e "  ${CYAN}data_stream.dataset : \"system.auth\"${RESET}    → auth log entries"
echo -e "  ${CYAN}data_stream.dataset : \"system.cpu\"${RESET}     → CPU metrics"
echo -e "  ${CYAN}data_stream.dataset : \"system.memory\"${RESET}  → memory metrics"
echo ""
