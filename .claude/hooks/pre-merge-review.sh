#!/usr/bin/env bash
# PreToolUse(Bash): マージの前に reviewer と pr-checker の記録を要求する。
set -euo pipefail
HOOK_NAME="pre-merge-review"
# shellcheck source=/dev/null
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

payload="$(cat)"
command_text="$(hook_extract_command "$payload")"
hook_trace "command=$command_text"

is_gh_merge=0
is_git_merge=0
printf '%s' "$command_text" | grep -Eq '(^|[;&|[:space:]])gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|$)' && is_gh_merge=1
printf '%s' "$command_text" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+merge([[:space:]]|$)' && is_git_merge=1

if [ "$is_gh_merge" -eq 0 ] && [ "$is_git_merge" -eq 0 ]; then
  exit 0
fi

root="$(hook_repo_root)"
marker_dir="$(hook_marker_dir "$root")"

if [ "$is_gh_merge" -eq 1 ]; then
  pr="$(printf '%s' "$command_text" | sed -n 's/.*gh[[:space:]]\+pr[[:space:]]\+merge[[:space:]]\+\([0-9]\+\).*/\1/p')"
  if [ -z "$pr" ]; then
    hook_block "$MSG_PR_NUMBER_REQUIRED"
  fi
  if ! sha="$(gh pr view "$pr" --json headRefOid --jq .headRefOid 2>/dev/null)"; then
    hook_block "$MSG_GH_FAILED"
  fi
  hook_trace "pr=$pr sha=$sha"
else
  ref="$(printf '%s' "$command_text" | sed -n 's/.*git[[:space:]]\+merge[[:space:]]\+\([^[:space:];&|-][^[:space:];&|]*\).*/\1/p')"
  if [ -z "$ref" ]; then
    hook_block "$MSG_REF_REQUIRED"
  fi
  if ! sha="$(git -C "$root" rev-parse --verify "$ref^{commit}" 2>/dev/null)"; then
    hook_block "$MSG_REF_UNRESOLVED"
  fi
  hook_trace "ref=$ref sha=$sha"
fi

short="${sha:0:12}"
missing=""
[ -f "$marker_dir/reviewer-$short.done" ]    || missing="$missing reviewer"
[ -f "$marker_dir/pr-checker-$short.done" ]  || missing="$missing pr-checker"

if [ -n "$missing" ]; then
  hook_block "$MSG_MERGE_REVIEW_REQUIRED
未完了:$missing（対象コミット $short）"
fi

hook_trace "passed"
exit 0
