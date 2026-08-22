"""GS-FX — nullable journal on FX subledger for zero-cost receipts (no GL).

Revision ID: 097_gs_fx_nullable_fx_journal
Revises: 096_scope_export_backfill
Create Date: 2026-08-22
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "097_gs_fx_nullable_fx_journal"
down_revision = "096_scope_export_backfill"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "fx_ledger_entries",
        "journal_entry_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "fx_ledger_entries",
        "journal_entry_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
