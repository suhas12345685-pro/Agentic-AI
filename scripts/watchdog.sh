#!/bin/bash
# JARVIS Watchdog — Layer 2 Self-Healing
# Monitors JARVIS process health, restarts on staleness.
#
# Add to system cron:
#   */3 * * * *   /path/to/jarvis/scripts/watchdog.sh

JARVIS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$JARVIS_DIR/data/jarvis.log"
PID_FILE="$JARVIS_DIR/data/jarvis.pid"
STALE_THRESHOLD_SECONDS=180  # 3 minutes

mkdir -p "$JARVIS_DIR/data"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') [WATCHDOG] $1" >> "$LOG_FILE"
}

is_running() {
  if [ -f "$PID_FILE" ]; then
    local pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

is_stale() {
  if [ ! -f "$LOG_FILE" ]; then
    return 0
  fi
  local last_modified=$(stat -c %Y "$LOG_FILE" 2>/dev/null || stat -f %m "$LOG_FILE" 2>/dev/null)
  local now=$(date +%s)
  local age=$((now - last_modified))
  if [ "$age" -gt "$STALE_THRESHOLD_SECONDS" ]; then
    return 0
  fi
  return 1
}

start_jarvis() {
  log "Starting JARVIS..."
  cd "$JARVIS_DIR"
  nohup node index.js >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  log "JARVIS started with PID $(cat $PID_FILE)"
}

stop_jarvis() {
  if [ -f "$PID_FILE" ]; then
    local pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      log "Killing stale process PID $pid"
      kill "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null
    fi
    rm -f "$PID_FILE"
  fi
}

# Main logic
if ! is_running; then
  log "JARVIS not running — starting"
  start_jarvis
elif is_stale; then
  log "JARVIS log is stale (>${STALE_THRESHOLD_SECONDS}s) — restarting"
  stop_jarvis
  sleep 2
  start_jarvis
fi
