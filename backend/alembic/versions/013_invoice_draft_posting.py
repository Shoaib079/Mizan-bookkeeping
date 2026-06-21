"""Invoice draft posting — posted status, journal link, Input VAT account seed."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013_invoice_draft_posting"
down_revision: Union[str, None] = "012_invoice_draft_review"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "invoice_drafts",
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "invoice_drafts",
        sa.Column("posted_by", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "invoice_drafts",
        sa.Column("journal_entry_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_invoice_drafts_journal_entry_id_journal_entries"),
        "invoice_drafts",
        "journal_entries",
        ["journal_entry_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        op.f("ix_invoice_drafts_journal_entry_id"),
        "invoice_drafts",
        ["journal_entry_id"],
    )

    # Idempotent seed: add Input VAT (1500) to entities that already have a chart but lack it.
    op.execute(
        """
        INSERT INTO accounts (
            id, entity_id, code, name_en, name_tr,
            account_type, normal_balance, accepts_opening_balance,
            is_active, created_at
        )
        SELECT
            gen_random_uuid(),
            e.id,
            '1500',
            'Input VAT',
            'Indirilecek KDV',
            'asset',
            'debit',
            false,
            true,
            now()
        FROM entities e
        WHERE EXISTS (
            SELECT 1 FROM accounts a WHERE a.entity_id = e.id
        )
        AND NOT EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.entity_id = e.id AND a.code = '1500'
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM accounts
        WHERE code = '1500'
          AND name_en = 'Input VAT'
          AND NOT EXISTS (
              SELECT 1 FROM journal_entry_lines jel
              JOIN journal_entries je ON je.id = jel.journal_entry_id
              WHERE jel.account_id = accounts.id
          )
        """
    )
    op.drop_index(op.f("ix_invoice_drafts_journal_entry_id"), table_name="invoice_drafts")
    op.drop_constraint(
        op.f("fk_invoice_drafts_journal_entry_id_journal_entries"),
        "invoice_drafts",
        type_="foreignkey",
    )
    op.drop_column("invoice_drafts", "journal_entry_id")
    op.drop_column("invoice_drafts", "posted_by")
    op.drop_column("invoice_drafts", "posted_at")
