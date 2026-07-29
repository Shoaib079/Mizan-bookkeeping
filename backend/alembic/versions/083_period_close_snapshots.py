"""Freeze account figures when a month is closed (FINANCIAL_AUDIT F3).

Balances are derived from live journal lines, so voiding a January entry in
March silently rewrites January's P&L — a month already exported to the
accountant could become a different month. This table stores what every account
read at the moment the month was sealed, so the exported version stays
available even after the books move on.

One row per account per closed month. Re-closing replaces the set; the
close/reopen audit events already record that it was resealed.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.rls import apply_entity_rls

revision: str = "083_period_close_snapshots"
down_revision: Union[str, None] = "082_statement_closing_balance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "period_close_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("period_lock_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("closing_balance_kurus", sa.Integer(), nullable=False),
        sa.Column("period_activity_kurus", sa.Integer(), nullable=False),
        sa.Column("period_debit_kurus", sa.Integer(), nullable=False),
        sa.Column("period_credit_kurus", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_period_close_snapshots_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["period_lock_id"],
            ["period_locks.id"],
            name=op.f("fk_period_close_snapshots_period_lock_id_period_locks"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name=op.f("fk_period_close_snapshots_account_id_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_period_close_snapshots")),
        sa.UniqueConstraint(
            "period_lock_id",
            "account_id",
            name=op.f("uq_period_close_snapshots_lock_account"),
        ),
    )
    op.create_index(
        op.f("ix_period_close_snapshots_period_lock_id"),
        "period_close_snapshots",
        ["period_lock_id"],
    )
    op.create_index(
        op.f("ix_period_close_snapshots_account_id"),
        "period_close_snapshots",
        ["account_id"],
    )

    bind = op.get_bind()
    apply_entity_rls(bind)


def downgrade() -> None:
    op.drop_index(
        op.f("ix_period_close_snapshots_account_id"),
        table_name="period_close_snapshots",
    )
    op.drop_index(
        op.f("ix_period_close_snapshots_period_lock_id"),
        table_name="period_close_snapshots",
    )
    op.drop_table("period_close_snapshots")
