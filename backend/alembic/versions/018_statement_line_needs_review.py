"""Statement line needs-review fields for near-match payment/transfer detection."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "018_statement_line_needs_review"
down_revision: Union[str, None] = "017_account_transfers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bank_statement_lines",
        sa.Column("review_reason", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "bank_statement_lines",
        sa.Column(
            "candidate_supplier_ledger_entry_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("supplier_ledger_entries.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column(
        "bank_statement_lines",
        sa.Column(
            "candidate_account_transfer_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("account_transfers.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_bank_statement_lines_candidate_supplier_ledger_entry_id",
        "bank_statement_lines",
        ["candidate_supplier_ledger_entry_id"],
    )
    op.create_index(
        "ix_bank_statement_lines_candidate_account_transfer_id",
        "bank_statement_lines",
        ["candidate_account_transfer_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bank_statement_lines_candidate_account_transfer_id",
        table_name="bank_statement_lines",
    )
    op.drop_index(
        "ix_bank_statement_lines_candidate_supplier_ledger_entry_id",
        table_name="bank_statement_lines",
    )
    op.drop_column("bank_statement_lines", "candidate_account_transfer_id")
    op.drop_column("bank_statement_lines", "candidate_supplier_ledger_entry_id")
    op.drop_column("bank_statement_lines", "review_reason")
