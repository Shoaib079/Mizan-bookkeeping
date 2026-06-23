"""Period lock audit immutability — append-only audit + no-delete locks (Phase 8.5 Slice 4)."""

from typing import Sequence, Union

from alembic import op

from app.db.provisioning import apply_database_integrity

revision: str = "042_period_lock_immutability"
down_revision: Union[str, None] = "041_period_locks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    apply_database_integrity(op.get_bind())


def downgrade() -> None:
    pass
