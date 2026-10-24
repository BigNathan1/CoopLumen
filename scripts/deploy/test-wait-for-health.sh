#!/usr/bin/env bash
# Exercises wait-for-health.sh against a throwaway local HTTP server, covering
# both the pass path and the failure paths the deploy relies on.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="${here}/wait-for-health.sh"
port="${TEST_PORT:-18765}"
url="http://127.0.0.1:${port}/health"
server_pid=""

stop_server() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
    server_pid=""
  fi
}
trap stop_server EXIT

# start_server <mode>
#   healthy       always 200
#   unhealthy     always 503
#   slow-start    503 for the first 3 requests, then 200
#   flapping      alternates 200 and 503
start_server() {
  stop_server
  MODE="$1" PORT="$port" node -e '
    const http = require("http");
    let n = 0;
    http.createServer((_req, res) => {
      n += 1;
      const mode = process.env.MODE;
      const ok =
        mode === "healthy" ||
        (mode === "slow-start" && n > 3) ||
        (mode === "flapping" && n % 2 === 1);
      res.statusCode = ok ? 200 : 503;
      res.end("{}");
    }).listen(Number(process.env.PORT), "127.0.0.1");
  ' &
  server_pid=$!
  for _ in $(seq 1 50); do
    if curl --silent --output /dev/null "$url" 2>/dev/null; then return 0; fi
    sleep 0.1
  done
  echo "test server failed to start" >&2
  exit 1
}

failures=0
expect_exit() {
  local name="$1" expected="$2"
  shift 2
  local actual=0
  "$@" >/dev/null 2>&1 || actual=$?
  if [[ "$actual" -eq "$expected" ]]; then
    echo "PASS ${name}"
  else
    echo "FAIL ${name}: expected exit ${expected}, got ${actual}"
    failures=$((failures + 1))
  fi
}

start_server healthy
expect_exit "healthy service passes" 0 "$script" "$url" 10 1 3

start_server slow-start
expect_exit "service that becomes healthy within the timeout passes" 0 "$script" "$url" 15 1 3

start_server unhealthy
expect_exit "service answering 503 fails after the timeout" 1 "$script" "$url" 3 1 3

start_server flapping
expect_exit "flapping service never reaches consecutive successes" 1 "$script" "$url" 4 1 3

stop_server
expect_exit "nothing listening fails after the timeout" 1 "$script" "$url" 3 1 3

expect_exit "missing url is a usage error" 2 "$script"
expect_exit "non-numeric timeout is a usage error" 2 "$script" "$url" abc

if [[ "$failures" -gt 0 ]]; then
  echo "${failures} test(s) failed" >&2
  exit 1
fi
echo "all wait-for-health tests passed"
