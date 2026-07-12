#!/usr/bin/env bash
# Scan tracked source for hardcoded secrets (Slice 12.5).
# Exits non-zero when likely real secrets appear in git-tracked files.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "FAIL: not inside a git repository" >&2
  exit 1
fi

should_skip() {
  local path="$1"
  case "$path" in
    .env|.env.*|*/.env|*/.env.*) return 0 ;;
    */node_modules/*|node_modules/*) return 0 ;;
    */.venv/*|*/.venv-*/*|.venv/*) return 0 ;;
    */__pycache__/*|*.pyc|*.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.woff|*.woff2|*.ttf|*.eot|*.pdf|*.tar|*.gz|*.zip)
      return 0
      ;;
  esac
  return 1
}

TMP_HITS="$(mktemp)"
trap 'rm -f "$TMP_HITS"' EXIT

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  should_skip "$file" && continue
  [[ -f "$file" ]] || continue
  grep -n -E \
    'sk_(live|test)_[A-Za-z0-9]{24,}|pk_(live|test)_[A-Za-z0-9]{24,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' \
    "$file" 2>/dev/null >>"$TMP_HITS" || true
done < <(git ls-files)

if [[ -s "$TMP_HITS" ]]; then
  FILTERED="$(mktemp)"
  grep -Ev '(sk_test_/pk_test_ rejected|sk_test_\.\.\.|# example only|example\.com)' "$TMP_HITS" >"$FILTERED" || true
  if [[ -s "$FILTERED" ]]; then
    echo "FAIL: possible hardcoded secrets in tracked files:" >&2
    cat "$FILTERED" >&2
    echo >&2
    echo "Owner checklist: no secrets in git; use host secret store only (Railway/Vercel env)." >&2
    rm -f "$FILTERED"
    exit 1
  fi
  rm -f "$FILTERED"
fi

echo "==> Secrets audit passed (no hardcoded secret patterns in tracked source)"
