"""Payment bounce pairs — outflow + return settled without extra GL."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "098_statement_bounce_pairs"
down_revision: Union[str, None] = "097_gs_fx_nullable_fx_journal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "statement_bounce_pairs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("statement_id", sa.Uuid(), nullable=False),
        sa.Column("person_type", sa.String(length=16), nullable=False),
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column("outflow_line_id", sa.Uuid(), nullable=False),
        sa.Column("return_line_id", sa.Uuid(), nullable=False),
        sa.Column("fee_line_id", sa.Uuid(), nullable=True),
        sa.Column("voided_journal_entry_id", sa.Uuid(), nullable=True),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name="fk_statement_bounce_pairs_entity_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["statement_id"],
            ["bank_statements.id"],
            name="fk_statement_bounce_pairs_statement_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["outflow_line_id"],
            ["bank_statement_lines.id"],
            name="fk_statement_bounce_pairs_outflow_line_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["return_line_id"],
            ["bank_statement_lines.id"],
            name="fk_statement_bounce_pairs_return_line_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["fee_line_id"],
            ["bank_statement_lines.id"],
            name="fk_statement_bounce_pairs_fee_line_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["voided_journal_entry_id"],
            ["journal_entries.id"],
            name="fk_statement_bounce_pairs_voided_journal_entry_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_statement_bounce_pairs_entity_id",
        "statement_bounce_pairs",
        ["entity_id"],
    )
    op.create_index(
        "ix_statement_bounce_pairs_statement_id",
        "statement_bounce_pairs",
        ["statement_id"],
    )

    op.add_column(
        "bank_statement_lines",
        sa.Column("bounce_pair_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_bank_statement_lines_bounce_pair_id",
        "bank_statement_lines",
        "statement_bounce_pairs",
        ["bounce_pair_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_bank_statement_lines_bounce_pair_id",
        "bank_statement_lines",
        ["bounce_pair_id"],
    )

    op.execute("ALTER TABLE statement_bounce_pairs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE statement_bounce_pairs FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY statement_bounce_pairs_entity_isolation ON statement_bounce_pairs
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
    op.execute(
        "DROP POLICY IF EXISTS statement_bounce_pairs_entity_isolation ON statement_bounce_pairs"
    )
    op.drop_index("ix_bank_statement_lines_bounce_pair_id", "bank_statement_lines")
    op.drop_constraint(
        "fk_bank_statement_lines_bounce_pair_id",
        "bank_statement_lines",
        type_="foreignkey",
    )
    op.drop_column("bank_statement_lines", "bounce_pair_id")

    op.drop_index("ix_statement_bounce_pairs_statement_id", "statement_bounce_pairs")
    op.drop_index("ix_statement_bounce_pairs_entity_id", "statement_bounce_pairs")
    op.drop_table("statement_bounce_pairs")
