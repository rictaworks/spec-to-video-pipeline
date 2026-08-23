#!/usr/bin/env bash
# フック共通処理。単独では実行しない。
set -euo pipefail

HOOK_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$HOOK_LIB_DIR/messages.conf"

hook_trace() {
  if [ "${HOOK_TRACE:-0}" = "1" ]; then
    printf '[%s] %s\n' "${HOOK_NAME:-hook}" "$1" >&2
  fi
}

# 検証に失敗した場合は exit 2 で停止する（フォールバックしない）
hook_block() {
  printf '%s\n' "$1" >&2
  exit 2
}

hook_repo_root() {
  local root
  if ! root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
    hook_block "$MSG_NOT_A_REPO"
  fi
  printf '%s\n' "$root"
}

# PreToolUse の JSON から Bash コマンド文字列を取り出す
hook_extract_command() {
  local payload="$1"
  printf '%s' "$payload" \
    | tr '\n' ' ' \
    | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)/\1/p' \
    | sed 's/"[[:space:]]*[,}].*$//'
}

hook_marker_dir() {
  local dir="$1/.claude/.review"
  mkdir -p "$dir"
  printf '%s\n' "$dir"
}

hook_digest() {
  sha256sum | cut -c1-16
}
