"""Journal amend links — Phase 8.5 Slice 2."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.ledger_immutability import apply_ledger_immutability

revision: str = "040_journal_amend_links"
down_revision: Union[str, None] = "039_idempotency"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "journal_entries",
        sa.Column("amends_entry_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "journal_entries",
        sa.Column("amended_by_entry_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        op.f("ix_journal_entries_amends_entry_id"),
        "journal_entries",
        ["amends_entry_id"],
    )
    op.create_index(
        op.f("ix_journal_entries_amended_by_entry_id"),
        "journal_entries",
        ["amended_by_entry_id"],
    )
    op.create_foreign_key(
        op.f("fk_journal_entries_amends_entry_id_journal_entries"),
        "journal_entries",
        "journal_entries",
        ["amends_entry_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_journal_entries_amended_by_entry_id_journal_entries"),
        "journal_entries",
        "journal_entries",
        ["amended_by_entry_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    apply_ledger_immutability(op.get_bind())


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_journal_entries_amended_by_entry_id_journal_entries"),
        "journal_entries",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_journal_entries_amends_entry_id_journal_entries"),
        "journal_entries",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_journal_entries_amended_by_entry_id"), table_name="journal_entries"
    )
    op.drop_index(op.f("ix_journal_entries_amends_entry_id"), table_name="journal_entries")
    op.drop_column("journal_entries", "amended_by_entry_id")
    op.drop_column("journal_entries", "amends_entry_id")
    apply_ledger_immutability(op.get_bind())
