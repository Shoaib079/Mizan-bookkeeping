"""Canonical DB integrity tail — RLS registry + immutability triggers (production path)."""

from typing import Sequence, Union

from alembic import op

from app.db.provisioning import apply_database_integrity

revision: str = "038_db_provisioning"
down_revision: Union[str, None] = "037_clerk_launch"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    apply_database_integrity(op.get_bind())


def downgrade() -> None:
    # Integrity objects are re-applied idempotently; downgrade is a no-op.
    pass
