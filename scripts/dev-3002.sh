#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/tmp/dev-3002.pid"
LOG_FILE="$ROOT_DIR/tmp/dev-server-3002.log"
PORT="3002"

mkdir -p "$ROOT_DIR/tmp"

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

if [[ -f "$PID_FILE" ]]; then
  existing_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if is_pid_running "$existing_pid"; then
    if ps -p "$existing_pid" -o args= | rg -q "next dev --port ${PORT}"; then
      echo "Dev server already running on port ${PORT} (pid: ${existing_pid})"
      echo "URL: http://localhost:${PORT}"
      exit 0
    fi
  fi
  rm -f "$PID_FILE"
fi

cd "$ROOT_DIR"
npm run db:check

# Fallback: detect existing process bound to port 3002.
port_owner="$(ss -ltnp 2>/dev/null | rg ":${PORT}" || true)"
if [[ -n "$port_owner" ]]; then
  port_pid="$(printf '%s' "$port_owner" | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1)"
  port_cwd="$(readlink -f "/proc/${port_pid}/cwd" 2>/dev/null || true)"

  if [[ -n "$port_pid" && "$port_cwd" == "$ROOT_DIR" ]]; then
    echo "$port_pid" > "$PID_FILE"
    echo "Dev server already running on port ${PORT} (pid: ${port_pid})"
    echo "URL: http://localhost:${PORT}"
    exit 0
  fi

  echo "Port ${PORT} is already in use by another process."
  echo "$port_owner"
  exit 1
fi

setsid npm run dev -- --port "$PORT" > "$LOG_FILE" 2>&1 &
new_pid="$!"
echo "$new_pid" > "$PID_FILE"

sleep 1
if is_pid_running "$new_pid"; then
  echo "Dev server started on http://localhost:${PORT} (pid: ${new_pid})"
  echo "Log: $LOG_FILE"
  exit 0
fi

rm -f "$PID_FILE"
echo "Failed to start dev server on port ${PORT}."
echo "Check log: $LOG_FILE"
exit 1
