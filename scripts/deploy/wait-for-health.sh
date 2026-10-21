#!/usr/bin/env bash
# Polls a health endpoint until it reports healthy, or gives up.
#
# Usage: wait-for-health.sh <url> [timeout_seconds] [interval_seconds] [required_successes]
#
# Healthy means HTTP 200. The API answers 503 from /health while its database is
# unreachable, so a started-but-not-ready container is correctly treated as
# unhealthy. `required_successes` consecutive 200s are needed (default 3) so one
# lucky response from a container that is still flapping does not pass.
#
# Exit codes: 0 healthy, 1 timed out, 2 bad usage.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <url> [timeout_seconds] [interval_seconds] [required_successes]" >&2
  exit 2
fi

url="$1"
timeout="${2:-60}"
interval="${3:-2}"
required="${4:-3}"

for value in "$timeout" "$interval" "$required"; do
  if ! [[ "$value" =~ ^[0-9]+$ ]] || [[ "$value" -lt 1 ]]; then
    echo "timeout, interval and required_successes must be positive integers" >&2
    exit 2
  fi
done

deadline=$((SECONDS + timeout))
successes=0
attempt=0

while true; do
  attempt=$((attempt + 1))
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --max-time 5 "$url" 2>/dev/null || true)"

  if [[ "$status" == "200" ]]; then
    successes=$((successes + 1))
    echo "health check ${attempt}: ${url} -> 200 (${successes}/${required})"
    if [[ "$successes" -ge "$required" ]]; then
      echo "healthy: ${url}"
      exit 0
    fi
  else
    successes=0
    echo "health check ${attempt}: ${url} -> ${status:-no response}"
  fi

  if [[ "$SECONDS" -ge "$deadline" ]]; then
    echo "unhealthy: ${url} did not report healthy within ${timeout}s" >&2
    exit 1
  fi
  sleep "$interval"
done
