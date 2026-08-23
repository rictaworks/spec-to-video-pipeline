#!/usr/bin/env bash
# レビュー実施の記録を残す。フックはこの記録の有無で通過を判定する。
set -euo pipefail
HOOK_NAME="record-review"
# shellcheck source=/dev/null
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

kind="${1:-}"
target="${2:-}"
root="$(hook_repo_root)"
marker_dir="$(hook_marker_dir "$root")"

case "$kind" in
  security)
    digest="$(git -C "$root" diff --cached | hook_digest)"
    if [ "$(git -C "$root" diff --cached --name-only | wc -l)" -eq 0 ]; then
      hook_block "$MSG_NO_STAGED"
    fi
    marker="$marker_dir/security-$digest.done"
    ;;
  reviewer|pr-checker)
    if [ -z "$target" ]; then
      hook_block "$MSG_RECORD_USAGE"
    fi
    if printf '%s' "$target" | grep -Eq '^[0-9]+$'; then
      if ! sha="$(gh pr view "$target" --json headRefOid --jq .headRefOid 2>/dev/null)"; then
        hook_block "$MSG_GH_FAILED"
      fi
    elif ! sha="$(git -C "$root" rev-parse --verify "$target^{commit}" 2>/dev/null)"; then
      hook_block "$MSG_REF_UNRESOLVED"
    fi
    marker="$marker_dir/$kind-${sha:0:12}.done"
    ;;
  *)
    hook_block "$MSG_RECORD_USAGE"
    ;;
esac

printf 'recorded_at=%s\nkind=%s\ntarget=%s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$kind" "${target:-staged}" > "$marker"
hook_trace "wrote $marker"
printf '記録した: %s\n' "${marker#"$root/"}"
