"""Server-side write idempotency — Phase 8.5 Slice 1.

Keep this package init free of middleware/auth imports so Alembic/bootstrap
can load ``models`` without pulling the FastAPI stack (or optional HTTP clients).
"""

from app.core.idempotency.models import IdempotencyRecord

__all__ = ["IdempotencyRecord"]
