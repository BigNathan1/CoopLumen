#!/usr/bin/env bash
# Zero-downtime blue/green deploy of the API behind the nginx proxy defined in
# docker-compose.prod.yml.
#
# Usage: deploy.sh <image>
#   e.g. deploy.sh ghcr.io/bignathan1/cooplumen-backend:sha-1a2b3c4
#
# Flow:
#   1. Start the idle slot on the new image. The live slot is untouched.
#   2. Poll the idle slot's /health until it passes (wait-for-health.sh).
#   3. Repoint the proxy at it with a graceful nginx reload.
#   4. Poll /health through the proxy to confirm the switch.
#   5. Stop the previous slot, giving in-flight requests stop_grace_period.
#
# Failure handling: if the new slot never becomes healthy, or the proxy check
# fails after the switch, the proxy is returned to the previous slot, the new
# slot is stopped, and the script exits non-zero. The previous slot keeps
# serving throughout, so a failed deploy costs no availability.
#
# Environment (all optional):
#   COMPOSE_FILE        compose file         (default docker-compose.prod.yml)
#   STATE_DIR           deploy state         (default ./.deploy)
#   PROXY_PORT          host port of proxy   (default 80)
#   BLUE_PORT           loopback port, blue  (default 4001)
#   GREEN_PORT          loopback port, green (default 4002)
#   HEALTH_TIMEOUT      seconds for a slot to become healthy (default 90)
#   HEALTH_INTERVAL     seconds between polls               (default 2)
#   PROXY_HEALTH_TIMEOUT seconds to confirm health via proxy (default 30)
set -euo pipefail

if [[ $# -ne 1 || -z "$1" ]]; then
  echo "usage: $0 <image>" >&2
  exit 2
fi
new_image="$1"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${here}/../.."

compose_file="${COMPOSE_FILE:-docker-compose.prod.yml}"
export STATE_DIR="${STATE_DIR:-./.deploy}"
state_dir="$STATE_DIR"
export PROXY_PORT="${PROXY_PORT:-80}"
proxy_port="$PROXY_PORT"
export BLUE_PORT="${BLUE_PORT:-4001}"
export GREEN_PORT="${GREEN_PORT:-4002}"
health_timeout="${HEALTH_TIMEOUT:-90}"
health_interval="${HEALTH_INTERVAL:-2}"
proxy_health_timeout="${PROXY_HEALTH_TIMEOUT:-30}"

compose() { docker compose -f "$compose_file" "$@"; }

mkdir -p "${state_dir}/nginx"
active_file="${state_dir}/active_slot"
upstream_file="${state_dir}/nginx/active.conf"
images_file="${state_dir}/images.env"

port_of() { if [[ "$1" == "blue" ]]; then echo "$BLUE_PORT"; else echo "$GREEN_PORT"; fi; }
other_of() { if [[ "$1" == "blue" ]]; then echo "green"; else echo "blue"; fi; }

# Remembers each slot's image so starting one never changes the other.
if [[ -f "$images_file" ]]; then
  # shellcheck disable=SC1090
  source "$images_file"
fi
BLUE_IMAGE="${BLUE_IMAGE:-cooplumen-backend:unset}"
GREEN_IMAGE="${GREEN_IMAGE:-cooplumen-backend:unset}"

if [[ -f "$active_file" ]]; then
  active="$(cat "$active_file")"
  first_deploy=false
else
  active="green" # so the first deploy lands on blue
  first_deploy=true
fi
target="$(other_of "$active")"
target_port="$(port_of "$target")"
target_service="backend-${target}"
active_service="backend-${active}"

echo "active slot: ${active} (first deploy: ${first_deploy}); deploying ${new_image} to ${target}"

set_upstream() {
  echo "server backend-$1:4000;" >"$upstream_file"
}

reload_proxy() {
  compose exec -T proxy nginx -t
  compose exec -T proxy nginx -s reload
}

persist_images() {
  {
    echo "BLUE_IMAGE=${BLUE_IMAGE}"
    echo "GREEN_IMAGE=${GREEN_IMAGE}"
  } >"$images_file"
}

if [[ "$target" == "blue" ]]; then BLUE_IMAGE="$new_image"; else GREEN_IMAGE="$new_image"; fi
export BLUE_IMAGE GREEN_IMAGE

# Never leave a half-started slot behind, and never touch the live one.
abort_deploy() {
  echo "deploy failed: ${1}" >&2
  compose stop "$target_service" >/dev/null 2>&1 || true
  compose rm -f "$target_service" >/dev/null 2>&1 || true
  exit 1
}

# 1. Bring up the idle slot. The proxy is created on the first deploy only; on
#    later deploys `up` leaves the running proxy and live slot alone.
if [[ "$first_deploy" == true ]]; then
  set_upstream "$target"
fi
compose pull "$target_service" || true
compose up -d --no-deps "$target_service" || abort_deploy "could not start ${target_service}"

# 2. The new slot must be healthy before it is allowed anywhere near traffic.
if ! bash "${here}/wait-for-health.sh" "http://127.0.0.1:${target_port}/health" \
  "$health_timeout" "$health_interval" 3; then
  compose logs --no-color --tail 80 "$target_service" || true
  abort_deploy "${target_service} did not become healthy within ${health_timeout}s"
fi

# 3. Switch traffic.
if [[ "$first_deploy" == true ]]; then
  compose up -d --no-deps proxy || abort_deploy "could not start proxy"
else
  set_upstream "$target"
  if ! reload_proxy; then
    set_upstream "$active"
    abort_deploy "proxy reload failed; traffic stays on ${active}"
  fi
fi

# 4. Confirm end to end through the proxy; roll back if it is not serving.
if ! bash "${here}/wait-for-health.sh" "http://127.0.0.1:${proxy_port}/health" \
  "$proxy_health_timeout" "$health_interval" 3; then
  echo "proxy health check failed after switch; rolling back to ${active}" >&2
  if [[ "$first_deploy" == false ]]; then
    set_upstream "$active"
    reload_proxy || echo "rollback reload failed; manual intervention required" >&2
  fi
  abort_deploy "proxy not healthy after switching to ${target}"
fi

# 5. Commit the new state, then retire the previous slot.
echo "$target" >"$active_file"
persist_images
if [[ "$first_deploy" == false ]]; then
  compose stop "$active_service"
  compose rm -f "$active_service" >/dev/null 2>&1 || true
fi

echo "deploy complete: ${target} is live on ${new_image}"
