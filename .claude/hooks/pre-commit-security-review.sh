#!/usr/bin/env bash
# PreToolUse(Bash): git commit の前にセキュリティレビューの記録を要求する。
set -euo pipefail
HOOK_NAME="pre-commit-security-review"
# shellcheck source=/dev/null
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

payload="$(cat)"
command_text="$(hook_extract_command "$payload")"
hook_trace "command=$command_text"

if ! printf '%s' "$command_text" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+([^;&|]*[[:space:]])?commit([[:space:]]|$)'; then
  exit 0
fi

root="$(hook_repo_root)"
marker_dir="$(hook_marker_dir "$root")"

if [ "$(git -C "$root" diff --cached --name-only | wc -l)" -eq 0 ]; then
  hook_block "$MSG_NO_STAGED"
fi

digest="$(git -C "$root" diff --cached -- . ':(exclude)review-records' | hook_digest)"
marker="$marker_dir/security-$digest.json"
hook_trace "marker=$marker"

if [ ! -f "$marker" ]; then
  hook_block "$MSG_SECURITY_REQUIRED"
fi

hook_trace "passed"
exit 0
