"""Supplier ledger journal_entry_id link for GL+subledger reconciliation."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014_supplier_ledger_journal_link"
down_revision: Union[str, None] = "013_invoice_draft_posting"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "supplier_ledger_entries",
        sa.Column("journal_entry_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        op.f("ix_supplier_ledger_entries_journal_entry_id"),
        "supplier_ledger_entries",
        ["journal_entry_id"],
        unique=False,
    )
    op.create_foreign_key(
        op.f("fk_supplier_ledger_entries_journal_entry_id_journal_entries"),
        "supplier_ledger_entries",
        "journal_entries",
        ["journal_entry_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_supplier_ledger_entries_journal_entry_id_journal_entries"),
        "supplier_ledger_entries",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_supplier_ledger_entries_journal_entry_id"),
        table_name="supplier_ledger_entries",
    )
    op.drop_column("supplier_ledger_entries", "journal_entry_id")
