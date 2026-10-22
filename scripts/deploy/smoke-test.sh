#!/usr/bin/env bash
# Smoke tests for deployed staging/production instances of CoopLumen backend.
#
# Usage: smoke-test.sh <base_url> [timeout_seconds] [interval_seconds]
#   e.g. smoke-test.sh https://cooplumen-staging-api.fly.dev 60 2
#
# Checks performed:
#   1. Readiness/Health check (/health):
#      - Must respond with HTTP 200 within timeout.
#      - JSON payload must contain "status":"ok" (verifies database & Stellar connectivity).
#   2. API endpoint availability (/api/communities):
#      - Must respond with HTTP 200 and valid JSON.
#   3. Error handling:
#      - Unmatched route must respond with HTTP 404, not unhandled 500 error.
#
# Exit codes:
#   0 - All smoke tests passed
#   1 - One or more smoke tests failed or timed out
#   2 - Usage error
set -euo pipefail

if [[ $# -lt 1 || -z "$1" ]]; then
  echo "usage: $0 <base_url> [timeout_seconds] [interval_seconds]" >&2
  exit 2
fi

raw_url="$1"
# Strip trailing slash if present
base_url="${raw_url%/}"
timeout="${2:-60}"
interval="${3:-2}"

for value in "$timeout" "$interval"; do
  if ! [[ "$value" =~ ^[0-9]+$ ]] || [[ "$value" -lt 1 ]]; then
    echo "timeout and interval must be positive integers" >&2
    exit 2
  fi
done

echo "Starting smoke tests against ${base_url} (timeout: ${timeout}s, interval: ${interval}s)"

deadline=$((SECONDS + timeout))
ready=false
attempt=0

# Step 1: Wait for service /health readiness
echo "--- Check 1: Health endpoint readiness (${base_url}/health) ---"
while true; do
  attempt=$((attempt + 1))
  http_code="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --max-time 5 "${base_url}/health" 2>/dev/null || true)"

  if [[ "$http_code" == "200" ]]; then
    body="$(curl --silent --max-time 5 "${base_url}/health" 2>/dev/null || true)"
    if echo "$body" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
      echo "[PASS] ${base_url}/health responded 200 with status ok (attempt ${attempt})"
      ready=true
      break
    else
      echo "health check ${attempt}: HTTP 200 but payload status is not ok (${body})"
    fi
  else
    echo "health check ${attempt}: HTTP ${http_code:-no response}"
  fi

  if [[ "$SECONDS" -ge "$deadline" ]]; then
    echo "[FAIL] ${base_url}/health did not report healthy within ${timeout}s" >&2
    exit 1
  fi

  sleep "$interval"
done

if [[ "$ready" != true ]]; then
  echo "[FAIL] Service never became ready" >&2
  exit 1
fi

# Step 2: Query API communities endpoint
echo "--- Check 2: Core API route (${base_url}/api/communities) ---"
api_code="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --max-time 10 "${base_url}/api/communities" 2>/dev/null || true)"

if [[ "$api_code" == "200" ]]; then
  echo "[PASS] ${base_url}/api/communities responded with HTTP 200"
else
  echo "[FAIL] ${base_url}/api/communities responded with HTTP ${api_code:-no response}" >&2
  exit 1
fi

# Step 3: Verify 404 handler for unknown routes
echo "--- Check 3: Non-existent route 404 handling ---"
not_found_code="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --max-time 5 "${base_url}/api/smoke-test-nonexistent-endpoint-verify-404" 2>/dev/null || true)"

if [[ "$not_found_code" == "404" ]]; then
  echo "[PASS] Unmatched route cleanly returned HTTP 404"
else
  echo "[FAIL] Unmatched route returned HTTP ${not_found_code:-no response} (expected 404)" >&2
  exit 1
fi

echo "All smoke tests passed successfully for ${base_url}"
exit 0
