#!/usr/bin/env bash
# Owner onboarding smoke — cold-start API path (entity → OB → member → expense → P&L).
# Usage:
#   API_URL=http://127.0.0.1:8000 ./scripts/smoke_onboarding.sh
#   API_URL=https://staging-api.onrender.com SMOKE_AUTH=enforced ./scripts/smoke_onboarding.sh
#   API_URL=https://staging-api.onrender.com SMOKE_BEARER_TOKEN='eyJ...' ./scripts/smoke_onboarding.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
API_URL="${API_URL:?Set API_URL to the API base URL (http://127.0.0.1:8000 or https://...)}"

VENV="${SMOKE_VENV:-$BACKEND/.venv}"
PYTHON="${SMOKE_PYTHON:-$VENV/bin/python}"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="$(command -v python3)"
fi

echo "==> Owner onboarding smoke against ${API_URL}"
(
  cd "$BACKEND"
  export API_URL
  PYTHONPATH=. "$PYTHON" scripts/smoke_onboarding.py "$@"
)
