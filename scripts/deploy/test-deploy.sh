#!/usr/bin/env bash
# Exercises deploy.sh and rollback.sh end to end without Docker.
#
# A fake `docker` on PATH starts/stops small local HTTP servers in place of the
# blue/green containers and the nginx proxy, so the real control flow of
# deploy.sh (slot selection, health gating, switching, rollback, state) runs
# for real. What this does NOT cover is Docker or nginx themselves; the compose
# file is validated separately with `docker compose config`.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d)"
# Native Windows node cannot open MSYS-style /tmp paths.
if command -v cygpath >/dev/null 2>&1; then work="$(cygpath -m "$work")"; fi
mkdir -p "${work}/bin" "${work}/run"

export FAKE_DIR="${work}/run"
export STATE_DIR="${work}/state"
export PROXY_PORT="${TEST_PROXY_PORT:-18100}"
export BLUE_PORT="${TEST_BLUE_PORT:-18101}"
export GREEN_PORT="${TEST_GREEN_PORT:-18102}"
export HEALTH_TIMEOUT=4
export HEALTH_INTERVAL=1
export PROXY_HEALTH_TIMEOUT=4

cleanup() {
  for pidfile in "${FAKE_DIR}"/*.pid; do
    if [[ -f "$pidfile" ]]; then kill "$(cat "$pidfile")" 2>/dev/null || true; fi
  done
  rm -rf "$work"
}
trap cleanup EXIT

# --- fake servers -----------------------------------------------------------

# Slot: answers /health with 200, or 503 when its mode file says unhealthy.
cat >"${work}/slot.js" <<'JS'
const http = require('http');
const fs = require('fs');
const [port, modeFile] = process.argv.slice(2);
http
  .createServer((_req, res) => {
    const mode = fs.existsSync(modeFile) ? fs.readFileSync(modeFile, 'utf8').trim() : 'healthy';
    res.statusCode = mode === 'healthy' ? 200 : 503;
    res.end('{}');
  })
  .listen(Number(port), '127.0.0.1');
JS

# Proxy: forwards to whichever slot active.conf names, re-read on every request
# (standing in for nginx picking up the file on reload). Returns 502 when the
# "proxy_down" marker exists.
cat >"${work}/proxy.js" <<'JS'
const http = require('http');
const fs = require('fs');
const [port, stateDir, blue, green, fakeDir] = process.argv.slice(2);
http
  .createServer((_req, res) => {
    if (fs.existsSync(`${fakeDir}/proxy_down`)) {
      res.statusCode = 502;
      return res.end();
    }
    const conf = fs.readFileSync(`${stateDir}/nginx/active.conf`, 'utf8');
    const slotPort = conf.includes('backend-blue') ? blue : green;
    http
      .get({ host: '127.0.0.1', port: slotPort, path: '/health' }, (up) => {
        res.statusCode = up.statusCode;
        up.resume();
        up.on('end', () => res.end());
      })
      .on('error', () => {
        res.statusCode = 502;
        res.end();
      });
  })
  .listen(Number(port), '127.0.0.1');
JS

# --- fake docker ------------------------------------------------------------

cat >"${work}/bin/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
shift          # "compose"
shift 2        # "-f <file>"
cmd="$1"; shift
js_dir="$(dirname "$FAKE_DIR")"

start() { # start <name> <js args...>
  local name="$1"; shift
  nohup node "$@" >/dev/null 2>&1 &
  echo $! >"${FAKE_DIR}/${name}.pid"
}
stop() {
  local pidfile="${FAKE_DIR}/$1.pid"
  if [[ -f "$pidfile" ]]; then kill "$(cat "$pidfile")" 2>/dev/null || true; rm -f "$pidfile"; fi
}

case "$cmd" in
  pull|rm|logs) exit 0 ;;
  run)
    # `compose run --rm --no-deps -T <service> <command...>`: the migration step.
    svc=""
    for arg in "$@"; do
      case "$arg" in backend-*) svc="$arg"; break ;; esac
    done
    if [[ "$svc" == "backend-blue" ]]; then image="$BLUE_IMAGE"; else image="$GREEN_IMAGE"; fi
    echo "migrate ${svc} ${image}" >>"${FAKE_DIR}/events.log"
    [[ "${FAKE_MIGRATE_FAIL:-0}" == "1" ]] && exit 1
    exit 0 ;;
  up)
    svc="${@: -1}"
    echo "up ${svc}" >>"${FAKE_DIR}/events.log"
    case "$svc" in
      backend-blue)  stop "$svc"; echo "$BLUE_IMAGE"  >"${FAKE_DIR}/${svc}.image"
                     start "$svc" "${js_dir}/slot.js" "$BLUE_PORT" "${FAKE_DIR}/${svc}.mode" ;;
      backend-green) stop "$svc"; echo "$GREEN_IMAGE" >"${FAKE_DIR}/${svc}.image"
                     start "$svc" "${js_dir}/slot.js" "$GREEN_PORT" "${FAKE_DIR}/${svc}.mode" ;;
      proxy)         start proxy "${js_dir}/proxy.js" "$PROXY_PORT" "$STATE_DIR" \
                       "$BLUE_PORT" "$GREEN_PORT" "$FAKE_DIR" ;;
    esac
    sleep 0.5 ;;
  stop) stop "$1"; rm -f "${FAKE_DIR}/$1.image" ;;
  exec)
    [[ "${FAKE_RELOAD_FAIL:-0}" == "1" ]] && [[ "$*" == *"-s reload"* ]] && exit 1
    exit 0 ;;
  *) echo "fake docker: unsupported command $cmd" >&2; exit 1 ;;
esac
SH
chmod +x "${work}/bin/docker"
bin_dir="${work}/bin"
if command -v cygpath >/dev/null 2>&1; then bin_dir="$(cygpath -u "$bin_dir")"; fi
export PATH="${bin_dir}:${PATH}"

# --- assertions -------------------------------------------------------------

failures=0
check() { # check <name> <command...>
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "PASS ${name}"; else echo "FAIL ${name}"; failures=$((failures + 1)); fi
}
deploy() { bash "${here}/deploy.sh" "$1" >"${work}/deploy.log" 2>&1; }
active() { cat "${STATE_DIR}/active_slot"; }
running() { [[ -f "${FAKE_DIR}/$1.pid" ]]; }
upstream_is() { grep -q "backend-$1:" "${STATE_DIR}/nginx/active.conf"; }
proxy_ok() { [[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PROXY_PORT}/health")" == "200" ]]; }
image_of() { cat "${FAKE_DIR}/$1.image"; }
previous() { cat "${STATE_DIR}/previous_image"; }
event_count() { grep -c "$1" "${FAKE_DIR}/events.log" || true; }
rollback() { bash "${here}/rollback.sh" >"${work}/rollback.log" 2>&1; }
touch "${FAKE_DIR}/events.log"

# 1. First deploy lands on blue and starts the proxy.
deploy app:v1 && ok=0 || ok=$?
check "first deploy succeeds" test "$ok" -eq 0
check "first deploy activates blue" test "$(active)" = blue
check "first deploy runs v1 on blue" test "$(image_of backend-blue)" = app:v1
check "first deploy points proxy at blue" upstream_is blue
check "first deploy serves through the proxy" proxy_ok

# 2. Second deploy goes to green and retires blue.
deploy app:v2 && ok=0 || ok=$?
check "second deploy succeeds" test "$ok" -eq 0
check "second deploy activates green" test "$(active)" = green
check "second deploy runs v2 on green" test "$(image_of backend-green)" = app:v2
check "second deploy points proxy at green" upstream_is green
check "second deploy stops the old blue slot" bash -c "! test -f '${FAKE_DIR}/backend-blue.pid'"
check "still serving through the proxy" proxy_ok

# 3. New slot never becomes healthy: deploy fails, live slot untouched.
echo unhealthy >"${FAKE_DIR}/backend-blue.mode"
deploy app:v3 && ok=0 || ok=$?
check "unhealthy deploy fails" test "$ok" -ne 0
check "unhealthy deploy keeps green active" test "$(active)" = green
check "unhealthy deploy keeps proxy on green" upstream_is green
check "unhealthy deploy leaves green running" running backend-green
check "unhealthy deploy tears down the failed slot" bash -c "! test -f '${FAKE_DIR}/backend-blue.pid'"
check "unhealthy deploy never interrupts service" proxy_ok
check "unhealthy deploy reports the reason" grep -q "did not become healthy" "${work}/deploy.log"
rm -f "${FAKE_DIR}/backend-blue.mode"

# 4. Proxy reload fails: traffic stays on the live slot.
FAKE_RELOAD_FAIL=1 deploy app:v4 && ok=0 || ok=$?
check "failed proxy reload fails the deploy" test "$ok" -ne 0
check "failed proxy reload keeps green active" test "$(active)" = green
check "failed proxy reload restores the upstream" upstream_is green
check "failed proxy reload still serves" proxy_ok

# 5. Proxy unhealthy after the switch: rolls back to the previous slot.
touch "${FAKE_DIR}/proxy_down"
deploy app:v5 && ok=0 || ok=$?
rm -f "${FAKE_DIR}/proxy_down"
check "post-switch failure fails the deploy" test "$ok" -ne 0
check "post-switch failure keeps green active" test "$(active)" = green
check "post-switch failure restores the upstream" upstream_is green
check "post-switch failure reports the rollback" grep -q "rolling back" "${work}/deploy.log"

# 6. Recovery: a good deploy after the failures works and alternates slots.
deploy app:v6 && ok=0 || ok=$?
check "deploy after failures succeeds" test "$ok" -eq 0
check "deploy after failures activates blue" test "$(active)" = blue
check "deploy after failures runs v6" test "$(image_of backend-blue)" = app:v6

# 6b. Migrations are opt-in: none of the deploys above asked for them.
check "migrations are skipped unless requested" test "$(event_count '^migrate')" -eq 0
check "deploys record the image they retired" test "$(previous)" = app:v2

# 8. RUN_MIGRATIONS=true migrates with the new image before the new slot starts.
mark="$(wc -l <"${FAKE_DIR}/events.log")"
RUN_MIGRATIONS=true deploy app:v7 && ok=0 || ok=$?
new_events() { tail -n +"$((mark + 1))" "${FAKE_DIR}/events.log"; }
check "deploy with migrations succeeds" test "$ok" -eq 0
check "deploy with migrations activates green" test "$(active)" = green
check "migrations run once, with the new image" test "$(new_events | grep -c '^migrate backend-green app:v7$')" -eq 1
check "migrations run before the new slot starts" test "$(new_events | head -n 1)" = "migrate backend-green app:v7"
check "deploy with migrations announces the step" grep -q "applying database migrations" "${work}/deploy.log"
check "deploy with migrations serves through the proxy" proxy_ok

# 9. A failing migration stops the deploy before anything changes.
mark="$(wc -l <"${FAKE_DIR}/events.log")"
FAKE_MIGRATE_FAIL=1 RUN_MIGRATIONS=true deploy app:v8 && ok=0 || ok=$?
check "failed migration fails the deploy" test "$ok" -ne 0
check "failed migration reports the reason" grep -q "database migration failed" "${work}/deploy.log"
check "failed migration never starts the new slot" test "$(new_events | grep -c '^up ')" -eq 0
check "failed migration keeps green active" test "$(active)" = green
check "failed migration keeps the proxy on green" upstream_is green
check "failed migration leaves green running" running backend-green
check "failed migration keeps the image history" test "$(previous)" = app:v6
check "failed migration never interrupts service" proxy_ok

# 10. Rollback redeploys the retired image, without re-running migrations.
mark="$(wc -l <"${FAKE_DIR}/events.log")"
RUN_MIGRATIONS=true rollback && ok=0 || ok=$?
check "rollback succeeds" test "$ok" -eq 0
check "rollback announces the target image" grep -q "rolling back to app:v6" "${work}/rollback.log"
check "rollback activates the other slot" test "$(active)" = blue
check "rollback runs the previous image" test "$(image_of backend-blue)" = app:v6
check "rollback points the proxy at the previous slot" upstream_is blue
check "rollback retires the bad release" bash -c "! test -f '${FAKE_DIR}/backend-green.pid'"
check "rollback does not run migrations" test "$(new_events | grep -c '^migrate')" -eq 0
check "rollback records the release it replaced" test "$(previous)" = app:v7
check "rollback serves through the proxy" proxy_ok

# 11. Rollback to an image that is not healthy is refused; the live slot is untouched.
echo unhealthy >"${FAKE_DIR}/backend-green.mode"
rollback && ok=0 || ok=$?
rm -f "${FAKE_DIR}/backend-green.mode"
check "rollback to an unhealthy image fails" test "$ok" -ne 0
check "rollback to an unhealthy image keeps blue active" test "$(active)" = blue
check "rollback to an unhealthy image keeps the proxy on blue" upstream_is blue
check "rollback to an unhealthy image never interrupts service" proxy_ok

# 12. Rollback with no history has nothing to go back to.
STATE_DIR="${work}/fresh-state" rollback && ok=0 || ok=$?
check "rollback without history fails" test "$ok" -ne 0
check "rollback without history says why" grep -q "nothing to roll back to" "${work}/rollback.log"
mkdir -p "${work}/unset-state"
echo "cooplumen-backend:unset" >"${work}/unset-state/previous_image"
STATE_DIR="${work}/unset-state" rollback && ok=0 || ok=$?
check "rollback to a never-started slot fails" test "$ok" -ne 0

# 7. Usage error.
bash "${here}/deploy.sh" >/dev/null 2>&1 && ok=0 || ok=$?
check "missing image is a usage error" test "$ok" -eq 2

if [[ "$failures" -gt 0 ]]; then
  echo "${failures} check(s) failed" >&2
  echo "--- last deploy log ---" >&2
  cat "${work}/deploy.log" >&2 || true
  exit 1
fi
echo "all deploy tests passed"
