#!/usr/bin/env bash
# Rolls the API back to the image that was live before the current one.
#
# Usage: rollback.sh
#
# deploy.sh records the image it retires in <STATE_DIR>/previous_image. This
# redeploys that image through deploy.sh, so the rollback gets the same
# blue/green switch, health gating and automatic recovery as any other deploy:
# a previous image that is no longer healthy is refused rather than promoted.
#
# Migrations are never re-run (RUN_MIGRATIONS is forced off). They only move the
# schema forward, so rolling back relies on each migration being backward
# compatible with the previous release.
#
# Running it twice swaps between the two most recent images, because each
# successful run records the image it replaced.
#
# Exit codes: 0 rolled back, 1 nothing to roll back to or the redeploy failed.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${here}/../.."

state_dir="${STATE_DIR:-./.deploy}"
previous_file="${state_dir}/previous_image"

if [[ ! -s "$previous_file" ]]; then
  echo "nothing to roll back to: no previous image is recorded in ${previous_file}" >&2
  exit 1
fi

previous_image="$(tr -d '[:space:]' <"$previous_file")"

# deploy.sh falls back to this placeholder for a slot it has never started.
if [[ -z "$previous_image" || "$previous_image" == *:unset ]]; then
  echo "nothing to roll back to: recorded image '${previous_image}' is not usable" >&2
  exit 1
fi

echo "rolling back to ${previous_image}"
RUN_MIGRATIONS=false exec bash "${here}/deploy.sh" "$previous_image"
