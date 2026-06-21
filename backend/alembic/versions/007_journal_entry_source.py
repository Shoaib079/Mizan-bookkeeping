"""Add journal_entries.source for entry origin typing."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_journal_entry_source"
down_revision: Union[str, None] = "006_ledger_immutability_bootstrap"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "journal_entries",
        sa.Column("source", sa.String(length=32), nullable=False, server_default="manual"),
    )
    op.create_index(
        op.f("ix_journal_entries_source"),
        "journal_entries",
        ["source"],
    )
    op.alter_column("journal_entries", "source", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_journal_entries_source"), table_name="journal_entries")
    op.drop_column("journal_entries", "source")
