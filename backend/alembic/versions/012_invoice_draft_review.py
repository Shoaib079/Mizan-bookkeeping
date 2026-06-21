"""Draft review workflow — confirmed status and audit fields."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012_invoice_draft_review"
down_revision: Union[str, None] = "011_invoice_draft_supplier_link"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "invoice_drafts",
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "invoice_drafts",
        sa.Column("confirmed_by", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "invoice_drafts",
        sa.Column("review_reason", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("invoice_drafts", "review_reason")
    op.drop_column("invoice_drafts", "confirmed_by")
    op.drop_column("invoice_drafts", "confirmed_at")
