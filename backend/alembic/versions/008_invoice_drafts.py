"""Invoice drafts table with entity-scoped RLS."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "008_invoice_drafts"
down_revision: Union[str, None] = "007_journal_entry_source"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "invoice_drafts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("file_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("supplier_name", sa.String(length=512), nullable=True),
        sa.Column("supplier_vkn", sa.String(length=11), nullable=True),
        sa.Column("invoice_number", sa.String(length=128), nullable=False),
        sa.Column("invoice_date", sa.Date(), nullable=False),
        sa.Column("net_kurus", sa.Integer(), nullable=False),
        sa.Column("gross_kurus", sa.Integer(), nullable=False),
        sa.Column("vat_breakdown", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="TRY"),
        sa.Column("extraction_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_invoice_drafts_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invoice_drafts")),
        sa.UniqueConstraint(
            "entity_id",
            "file_fingerprint",
            name="uq_invoice_drafts_entity_fingerprint",
        ),
    )
    op.create_index(
        op.f("ix_invoice_drafts_entity_id"), "invoice_drafts", ["entity_id"]
    )
    op.create_index(
        op.f("ix_invoice_drafts_file_fingerprint"),
        "invoice_drafts",
        ["file_fingerprint"],
    )

    op.execute("ALTER TABLE invoice_drafts ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE invoice_drafts FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY invoice_drafts_entity_isolation ON invoice_drafts
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS invoice_drafts_entity_isolation ON invoice_drafts")
    op.drop_index(op.f("ix_invoice_drafts_file_fingerprint"), table_name="invoice_drafts")
    op.drop_index(op.f("ix_invoice_drafts_entity_id"), table_name="invoice_drafts")
    op.drop_table("invoice_drafts")
