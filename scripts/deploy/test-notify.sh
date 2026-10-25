#!/usr/bin/env bash
# Exercises notify.sh against a throwaway local webhook server: the payload sent
# for Slack and Discord, the skip when no webhook is configured, and the failure
# paths (rejected message, unreachable webhook, bad usage).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="${here}/notify.sh"
work="$(mktemp -d)"
# Native Windows node cannot open MSYS-style /tmp paths.
if command -v cygpath >/dev/null 2>&1; then work="$(cygpath -m "$work")"; fi
port="${TEST_PORT:-18766}"
secret="s3cr3t-token"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

# Records every request body and answers with the status in the "status" file
# (200 when absent), standing in for a Slack or Discord webhook.
cat >"${work}/server.js" <<'JS'
const http = require('http');
const fs = require('fs');
const [port, dir] = process.argv.slice(2);
http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      fs.appendFileSync(`${dir}/requests.log`, `${req.method} ${req.url} ${req.headers['content-type']}\n`);
      fs.writeFileSync(`${dir}/body.json`, body);
      const statusFile = `${dir}/status`;
      res.statusCode = fs.existsSync(statusFile) ? Number(fs.readFileSync(statusFile, 'utf8')) : 200;
      res.end();
    });
  })
  .listen(Number(port), '127.0.0.1');
JS
node "${work}/server.js" "$port" "$work" &
server_pid=$!
for _ in $(seq 1 50); do
  if curl --silent --output /dev/null "http://127.0.0.1:${port}/"; then break; fi
  sleep 0.1
done
: >"${work}/requests.log"

url="http://127.0.0.1:${port}/hooks/${secret}"
failures=0
check() { # check <name> <command...>
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "PASS ${name}"; else echo "FAIL ${name}"; failures=$((failures + 1)); fi
}
notify() { bash "$script" "$@" >"${work}/out.log" 2>&1; }
requests() { grep -c . "${work}/requests.log" || true; }
body_field() { node -e 'const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const v = process.argv[2].split(".").reduce((o, k) => o?.[k], b); console.log(typeof v === "string" ? v : JSON.stringify(v));' "${work}/body.json" "$1"; }

# 1. Slack: the message reaches the webhook as JSON with a status label.
NOTIFY_WEBHOOK_URL="$url" NOTIFY_PROVIDER=slack notify success "Deployed sha-abc123 to production" "https://example.test/run/1" && ok=0 || ok=$?
check "slack send succeeds" test "$ok" -eq 0
check "slack posts JSON to the webhook path" grep -q "^POST /hooks/${secret} application/json" "${work}/requests.log"
check "slack text carries the status label" bash -c "[[ \"\$($(declare -f body_field); work='${work}'; body_field text)\" == \"[SUCCESS] Deployed sha-abc123 to production\"* ]]"
check "slack text carries the link" bash -c "$(declare -f body_field); work='${work}'; body_field text | grep -q 'https://example.test/run/1'"

# 2. Slack control characters from commit or branch text are escaped.
NOTIFY_WEBHOOK_URL="$url" NOTIFY_PROVIDER=slack notify failure 'CI failed on <!channel> & "quotes"' && ok=0 || ok=$?
check "slack escaped send succeeds" test "$ok" -eq 0
check "slack failure carries the failure label" bash -c "$(declare -f body_field); work='${work}'; body_field text | grep -q '^\[FAILURE\]'"
check "slack escapes angle brackets and ampersands" bash -c "$(declare -f body_field); work='${work}'; body_field text | grep -q '&lt;!channel&gt; &amp; \"quotes\"'"

# 3. Discord: uses the content field and cannot ping anyone.
NOTIFY_WEBHOOK_URL="$url" NOTIFY_PROVIDER=discord notify failure "CI failed on main @everyone" && ok=0 || ok=$?
check "discord send succeeds" test "$ok" -eq 0
check "discord body uses the content field" bash -c "$(declare -f body_field); work='${work}'; body_field content | grep -q '^\[FAILURE\] CI failed on main'"
check "discord body disables mentions" bash -c "$(declare -f body_field); work='${work}'; test \"\$(body_field allowed_mentions.parse)\" = '[]'"

# 4. Long messages are cut to fit Discord's 2000 character limit.
long="$(head -c 5000 /dev/zero | tr '\0' 'x')"
NOTIFY_WEBHOOK_URL="$url" NOTIFY_PROVIDER=discord notify success "$long" && ok=0 || ok=$?
check "long message is sent" test "$ok" -eq 0
check "long message fits the Discord limit" bash -c "$(declare -f body_field); work='${work}'; test \"\$(body_field content | tr -d '\n' | wc -c)\" -le 2000"

# 5. No webhook configured: skipped without failing, and nothing is sent.
before="$(requests)"
NOTIFY_WEBHOOK_URL="" notify failure "CI failed" && ok=0 || ok=$?
check "missing webhook is not an error" test "$ok" -eq 0
check "missing webhook warns" grep -q "NOTIFY_WEBHOOK_URL is not set" "${work}/out.log"
check "missing webhook sends nothing" test "$(requests)" -eq "$before"
env -u NOTIFY_WEBHOOK_URL bash "$script" success "ok" >/dev/null 2>&1 && ok=0 || ok=$?
check "unset webhook is not an error" test "$ok" -eq 0

# 6. The webhook rejects the message: the script fails and does not leak the URL.
echo 400 >"${work}/status"
NOTIFY_WEBHOOK_URL="$url" NOTIFY_PROVIDER=slack notify failure "CI failed" && ok=0 || ok=$?
check "rejected message fails" test "$ok" -eq 1
check "rejected message reports the HTTP status" grep -q "HTTP 400" "${work}/out.log"
check "rejected message does not print the webhook secret" bash -c "! grep -q '${secret}' '${work}/out.log'"
rm -f "${work}/status"

# 7. The webhook is unreachable.
NOTIFY_WEBHOOK_URL="http://127.0.0.1:1/hooks/${secret}" NOTIFY_PROVIDER=slack notify failure "CI failed" && ok=0 || ok=$?
check "unreachable webhook fails" test "$ok" -eq 1
check "unreachable webhook does not print the webhook secret" bash -c "! grep -q '${secret}' '${work}/out.log'"

# 8. Bad usage.
NOTIFY_WEBHOOK_URL="$url" NOTIFY_PROVIDER=slack notify && ok=0 || ok=$?
check "missing arguments is a usage error" test "$ok" -eq 2
NOTIFY_WEBHOOK_URL="$url" NOTIFY_PROVIDER=slack notify cancelled "CI cancelled" && ok=0 || ok=$?
check "unknown status is a usage error" test "$ok" -eq 2
NOTIFY_WEBHOOK_URL="$url" notify success "ok" && ok=0 || ok=$?
check "unrecognised webhook host needs a provider" test "$ok" -eq 2
NOTIFY_WEBHOOK_URL="$url" NOTIFY_PROVIDER=teams notify success "ok" && ok=0 || ok=$?
check "unsupported provider is a usage error" test "$ok" -eq 2

if [[ "$failures" -gt 0 ]]; then
  echo "${failures} check(s) failed" >&2
  echo "--- last output ---" >&2
  cat "${work}/out.log" >&2 || true
  exit 1
fi
echo "all notify tests passed"
