"""Invoice draft iade reference — original fatura link."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "067_invoice_draft_iade_reference"
down_revision: Union[str, None] = "066_supplier_default_expense_account"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "invoice_drafts",
        sa.Column("referenced_invoice_number", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "invoice_drafts",
        sa.Column("referenced_invoice_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("invoice_drafts", "referenced_invoice_date")
    op.drop_column("invoice_drafts", "referenced_invoice_number")
