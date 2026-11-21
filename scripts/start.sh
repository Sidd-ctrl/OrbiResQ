#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
CV_PORT="${CV_PORT:-8100}"
export CV_SERVICE_URL="${CV_SERVICE_URL:-http://127.0.0.1:${CV_PORT}}"
export DATABASE_URL="${DATABASE_URL:-sqlite:///$(pwd)/data/orbi_resq.db}"
export DATA_DIR="${DATA_DIR:-$(pwd)/data}"

mkdir -p "$DATA_DIR"

python3 -m uvicorn cv_service.app:app --host 127.0.0.1 --port "$CV_PORT" --log-level warning &
CV_PID=$!

cleanup() {
  kill "$CV_PID" 2>/dev/null || true
}
trap cleanup EXIT

python3 -m uvicorn server.app.main:app --host 0.0.0.0 --port "$PORT" --proxy-headers --forwarded-allow-ips='*'
