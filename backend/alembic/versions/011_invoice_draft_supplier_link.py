"""Add supplier_id FK on invoice_drafts for draft→supplier linking."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011_invoice_draft_supplier_link"
down_revision: Union[str, None] = "010_supplier_ledger"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "invoice_drafts",
        sa.Column("supplier_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_invoice_drafts_supplier_id_suppliers"),
        "invoice_drafts",
        "suppliers",
        ["supplier_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_invoice_drafts_supplier_id"),
        "invoice_drafts",
        ["supplier_id"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_invoice_drafts_supplier_id"), table_name="invoice_drafts")
    op.drop_constraint(
        op.f("fk_invoice_drafts_supplier_id_suppliers"),
        "invoice_drafts",
        type_="foreignkey",
    )
    op.drop_column("invoice_drafts", "supplier_id")
