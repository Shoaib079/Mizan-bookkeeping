# TESTS

Test register: what is tested, why it matters, pass/fail status (see CURSOR_RULES.md §8).

| Test file | What it guards | Status |
|-----------|----------------|--------|
| `backend/tests/test_health.py` | API liveness for deploy/dev | pass |
| `backend/tests/test_money.py` | Integer kuruş, Turkish format, loose parse (Decisions §5) | pass |

Run: `cd backend && .venv/bin/pytest -v`

Frontend: `cd frontend && npm run build` (typecheck + compile).
