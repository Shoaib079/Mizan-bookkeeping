"""Expense receipt multi-line intake (Phase 8.7 D1).

Parent intake per uploaded photo with N line drafts; confirm posts N expense entries.
Moves photo fingerprint dedup from expense_entries to expense_receipt_intakes.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db.rls import apply_entity_rls

revision: str = "048_expense_receipt_intake"
down_revision: Union[str, None] = "047_expense_source_document"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "expense_receipt_intakes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "needs_review",
                "posted",
                "rejected",
                name="expense_receipt_intake_status",
                native_enum=False,
                length=16,
            ),
            nullable=False,
        ),
        sa.Column("file_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("source_document_path", sa.String(length=1024), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("money_account_id", sa.Uuid(), nullable=False),
        sa.Column("receipt_total_kurus", sa.Integer(), nullable=True),
        sa.Column(
            "extraction_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("review_reason", sa.String(length=512), nullable=True),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("posted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["money_account_id"], ["money_accounts.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "entity_id",
            "file_fingerprint",
            name="uq_expense_receipt_intakes_entity_fingerprint",
        ),
    )
    op.create_index(
        "ix_expense_receipt_intakes_entity_id",
        "expense_receipt_intakes",
        ["entity_id"],
    )
    op.create_index(
        "ix_expense_receipt_intakes_file_fingerprint",
        "expense_receipt_intakes",
        ["file_fingerprint"],
    )
    op.create_index(
        "ix_expense_receipt_intakes_money_account_id",
        "expense_receipt_intakes",
        ["money_account_id"],
    )

    op.create_table(
        "expense_receipt_lines",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("intake_id", sa.Uuid(), nullable=False),
        sa.Column("line_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("written_item_description", sa.String(length=512), nullable=True),
        sa.Column("amount_kurus", sa.Integer(), nullable=False),
        sa.Column("expense_account_id", sa.Uuid(), nullable=False),
        sa.Column("review_reason", sa.String(length=512), nullable=True),
        sa.Column("candidate_expense_item_id", sa.Uuid(), nullable=True),
        sa.Column("expense_entry_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["intake_id"], ["expense_receipt_intakes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["expense_account_id"], ["accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["candidate_expense_item_id"], ["expense_items.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["expense_entry_id"], ["expense_entries.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("expense_entry_id", name="uq_expense_receipt_lines_expense_entry_id"),
    )
    op.create_index(
        "ix_expense_receipt_lines_intake_id",
        "expense_receipt_lines",
        ["intake_id"],
    )
    op.create_index(
        "ix_expense_receipt_lines_expense_account_id",
        "expense_receipt_lines",
        ["expense_account_id"],
    )

    op.add_column(
        "expense_entries",
        sa.Column("expense_receipt_intake_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        "ix_expense_entries_expense_receipt_intake_id",
        "expense_entries",
        ["expense_receipt_intake_id"],
    )
    op.create_foreign_key(
        "fk_expense_entries_expense_receipt_intake_id",
        "expense_entries",
        "expense_receipt_intakes",
        ["expense_receipt_intake_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.drop_constraint(
        "uq_expense_entries_entity_source_fingerprint",
        "expense_entries",
        type_="unique",
    )

    apply_entity_rls(op.get_bind())


def downgrade() -> None:
    op.create_unique_constraint(
        "uq_expense_entries_entity_source_fingerprint",
        "expense_entries",
        ["entity_id", "source_document_fingerprint"],
    )
    op.drop_constraint(
        "fk_expense_entries_expense_receipt_intake_id",
        "expense_entries",
        type_="foreignkey",
    )
    op.drop_index("ix_expense_entries_expense_receipt_intake_id", table_name="expense_entries")
    op.drop_column("expense_entries", "expense_receipt_intake_id")
    op.drop_table("expense_receipt_lines")
    op.drop_table("expense_receipt_intakes")
    op.execute("DROP TYPE IF EXISTS expense_receipt_intake_status")
