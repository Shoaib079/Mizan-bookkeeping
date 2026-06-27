#!/usr/bin/env bash
# Production dependency CVE scan via pip-audit (Slice 12.5).
# Fails on known vulnerabilities in runtime (non-dev) dependencies.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCAN_VENV="${SECURITY_SCAN_VENV:-$ROOT/.venv-security-scan}"

cleanup() {
  if [[ "${KEEP_SECURITY_SCAN_VENV:-}" != "1" ]]; then
    rm -rf "$SCAN_VENV"
  fi
}
trap cleanup EXIT

echo "==> Security scan venv at $SCAN_VENV"
python3 -m venv "$SCAN_VENV"
"$SCAN_VENV/bin/pip" install -q -U pip setuptools wheel
"$SCAN_VENV/bin/pip" install -q pip-audit
# Install production deps only — dev/test packages are out of scope for launch CVE gate.
"$SCAN_VENV/bin/pip" install -q -e "$ROOT"

echo "==> pip-audit (production dependencies)"
"$SCAN_VENV/bin/pip-audit" --desc on

echo "==> Dependency security scan passed"
