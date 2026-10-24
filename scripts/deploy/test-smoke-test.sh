#!/usr/bin/env bash
# Exercises smoke-test.sh against a throwaway local HTTP server, covering
# both the happy path and all critical failure and edge cases.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="${here}/smoke-test.sh"
port="${TEST_PORT:-18766}"
url="http://127.0.0.1:${port}"
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
#   healthy: /health 200 {"status":"ok"}, /api/communities 200, 404 on others
#   slow-start: /health 503 for first 2 requests then 200 {"status":"ok"}
#   unhealthy: /health 503
#   degraded: /health 200 {"status":"degraded"}
#   api-error: /health 200 {"status":"ok"}, /api/communities 500
#   bad-404: unmatched route returns 500 instead of 404
start_server() {
  stop_server
  MODE="$1" PORT="$port" node -e '
    const http = require("http");
    let healthCount = 0;
    http.createServer((req, res) => {
      const mode = process.env.MODE;
      const parsedUrl = new URL(req.url, "http://127.0.0.1");

      if (parsedUrl.pathname === "/health") {
        healthCount += 1;
        if (mode === "unhealthy") {
          res.statusCode = 503;
          res.end(JSON.stringify({ status: "degraded", db: "error" }));
        } else if (mode === "degraded") {
          res.statusCode = 200;
          res.end(JSON.stringify({ status: "degraded", db: "error" }));
        } else if (mode === "slow-start") {
          if (healthCount <= 2) {
            res.statusCode = 503;
            res.end(JSON.stringify({ status: "degraded" }));
          } else {
            res.statusCode = 200;
            res.end(JSON.stringify({ status: "ok", db: "ok", stellar: "ok" }));
          }
        } else {
          res.statusCode = 200;
          res.end(JSON.stringify({ status: "ok", db: "ok", stellar: "ok" }));
        }
        return;
      }

      if (parsedUrl.pathname === "/api/communities") {
        if (mode === "api-error") {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Internal Server Error" }));
        } else {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ data: [], meta: { page: 1, limit: 10, total: 0 } }));
        }
        return;
      }

      if (mode === "bad-404") {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "crash on 404" }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: "Not Found" }));
    }).listen(Number(process.env.PORT), "127.0.0.1");
  ' &
  server_pid=$!
  for _ in $(seq 1 50); do
    if curl --silent --output /dev/null "$url/health" 2>/dev/null; then return 0; fi
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
expect_exit "healthy backend passes all smoke checks" 0 bash "$script" "$url" 10 1

start_server slow-start
expect_exit "backend that starts slowly passes within timeout" 0 bash "$script" "$url" 15 1

start_server unhealthy
expect_exit "unhealthy backend answering 503 fails smoke tests" 1 bash "$script" "$url" 3 1

start_server degraded
expect_exit "backend answering 200 with degraded status fails smoke tests" 1 bash "$script" "$url" 3 1

start_server api-error
expect_exit "backend with failing /api/communities route fails smoke tests" 1 bash "$script" "$url" 10 1

start_server bad-404
expect_exit "backend crashing on unknown route fails smoke tests" 1 bash "$script" "$url" 10 1

stop_server
expect_exit "unreachable endpoint fails smoke tests" 1 bash "$script" "http://127.0.0.1:1" 2 1
expect_exit "missing url argument is a usage error" 2 bash "$script"
expect_exit "non-numeric timeout is a usage error" 2 bash "$script" "$url" abc 1
expect_exit "non-numeric interval is a usage error" 2 bash "$script" "$url" 10 abc

if [[ "$failures" -gt 0 ]]; then
  echo "${failures} smoke test check(s) failed" >&2
  exit 1
fi
echo "all smoke test checks passed"
