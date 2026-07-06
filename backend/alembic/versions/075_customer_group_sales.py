"""Customer agency fields + group credit sale / forex payment metadata."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "075_customer_group_sales"
down_revision: Union[str, None] = "074_statement_rule_expense_account"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("tax_id", sa.String(length=11), nullable=True))
    op.add_column(
        "customers", sa.Column("contact_name", sa.String(length=255), nullable=True)
    )
    op.add_column("customers", sa.Column("phone", sa.String(length=32), nullable=True))

    op.add_column("customer_ledger_entries", sa.Column("pax", sa.Integer(), nullable=True))
    op.add_column(
        "customer_ledger_entries",
        sa.Column("rate_per_person_kurus", sa.Integer(), nullable=True),
    )
    op.add_column(
        "customer_ledger_entries",
        sa.Column("forex_currency", sa.String(length=3), nullable=True),
    )
    op.add_column(
        "customer_ledger_entries",
        sa.Column("rate_per_person_forex_minor", sa.Integer(), nullable=True),
    )
    op.add_column(
        "customer_ledger_entries",
        sa.Column("total_forex_minor", sa.Integer(), nullable=True),
    )
    op.add_column(
        "customer_ledger_entries",
        sa.Column("payment_native_quantity", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("customer_ledger_entries", "payment_native_quantity")
    op.drop_column("customer_ledger_entries", "total_forex_minor")
    op.drop_column("customer_ledger_entries", "rate_per_person_forex_minor")
    op.drop_column("customer_ledger_entries", "forex_currency")
    op.drop_column("customer_ledger_entries", "rate_per_person_kurus")
    op.drop_column("customer_ledger_entries", "pax")
    op.drop_column("customers", "phone")
    op.drop_column("customers", "contact_name")
    op.drop_column("customers", "tax_id")
