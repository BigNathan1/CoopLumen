#!/usr/bin/env bash
# Posts a pipeline notification to a Slack or Discord incoming webhook.
#
# Usage: notify.sh <success|failure> <message> [link]
#
# Environment:
#   NOTIFY_WEBHOOK_URL  incoming webhook URL (a secret; never echoed). When it is
#                       empty or unset the script prints a warning and exits 0,
#                       so forks and repositories without the secret still pass.
#   NOTIFY_PROVIDER     "slack" or "discord". Detected from the URL host when
#                       unset (hooks.slack.com, discord.com, discordapp.com).
#
# Exit codes: 0 sent or skipped, 1 the webhook rejected the message or could not
# be reached, 2 bad usage or an unrecognised provider.
#
# The message may contain text from commits or branch names, so it is sent as
# JSON built by node (never interpolated into a shell string), Slack control
# characters are escaped, and Discord mentions are disabled.
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "usage: $0 <success|failure> <message> [link]" >&2
  exit 2
fi

status="$1"
message="$2"
link="${3:-}"

case "$status" in
  success | failure) ;;
  *)
    echo "status must be 'success' or 'failure', got '${status}'" >&2
    exit 2
    ;;
esac

webhook="${NOTIFY_WEBHOOK_URL:-}"
if [[ -z "$webhook" ]]; then
  echo "::warning::NOTIFY_WEBHOOK_URL is not set; skipping the ${status} notification."
  exit 0
fi

provider="${NOTIFY_PROVIDER:-}"
if [[ -z "$provider" ]]; then
  case "$webhook" in
    https://hooks.slack.com/*) provider="slack" ;;
    https://discord.com/api/webhooks/* | https://discordapp.com/api/webhooks/*) provider="discord" ;;
  esac
fi

if [[ "$provider" != "slack" && "$provider" != "discord" ]]; then
  echo "cannot tell whether the webhook is Slack or Discord; set NOTIFY_PROVIDER" >&2
  exit 2
fi

# Kept in a heredoc rather than a single-quoted argument so the template
# literals below are plain text to the shell.
build_payload="$(
  cat <<'JS'
const [provider, status, message, link] = process.argv.slice(1);
const label = status === 'success' ? 'SUCCESS' : 'FAILURE';
let text = `[${label}] ${message}`;
if (link) text += `\n${link}`;
text = text.slice(0, 1900);
if (provider === 'slack') {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  console.log(JSON.stringify({ text: escaped }));
} else {
  console.log(JSON.stringify({ content: text, allowed_mentions: { parse: [] } }));
}
JS
)"
payload="$(node -e "$build_payload" "$provider" "$status" "$message" "$link")"

http_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --max-time 15 --retry 2 \
  --header 'Content-Type: application/json' \
  --data-binary "$payload" "$webhook" || true)"

if [[ ! "$http_status" =~ ^2[0-9][0-9]$ ]]; then
  echo "notification failed: ${provider} webhook answered HTTP ${http_status:-000}" >&2
  exit 1
fi

echo "sent ${status} notification to ${provider}"
