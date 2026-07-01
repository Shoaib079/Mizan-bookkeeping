"""Bank statement line dedup + drop file retention."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "062_bank_statement_line_dedup"
down_revision: Union[str, None] = "061_unified_document_learning"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bank_statement_lines",
        sa.Column("dedup_key", sa.String(length=64), nullable=True),
    )
    op.alter_column(
        "bank_statements",
        "storage_path",
        existing_type=sa.String(length=1024),
        nullable=True,
    )

    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT bsl.id, bs.money_account_id, bsl.transaction_date,
                   bsl.amount_kurus, bsl.description, bsl.reference
            FROM bank_statement_lines bsl
            JOIN bank_statements bs ON bs.id = bsl.statement_id
            WHERE bsl.dedup_key IS NULL
            """
        )
    ).fetchall()

    if rows:
        from app.core.banking.line_dedup import statement_line_dedup_key

        for row in rows:
            dedup_key = statement_line_dedup_key(
                row.money_account_id,
                transaction_date=row.transaction_date,
                amount_kurus=row.amount_kurus,
                description=row.description,
                reference=row.reference,
            )
            connection.execute(
                sa.text(
                    "UPDATE bank_statement_lines SET dedup_key = :dedup_key WHERE id = :id"
                ),
                {"dedup_key": dedup_key, "id": row.id},
            )

    op.alter_column(
        "bank_statement_lines",
        "dedup_key",
        existing_type=sa.String(length=64),
        nullable=False,
    )
    op.create_index(
        "ix_bank_statement_lines_dedup_key",
        "bank_statement_lines",
        ["dedup_key"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_bank_statement_lines_entity_dedup",
        "bank_statement_lines",
        ["entity_id", "dedup_key"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_bank_statement_lines_entity_dedup",
        "bank_statement_lines",
        type_="unique",
    )
    op.drop_index("ix_bank_statement_lines_dedup_key", table_name="bank_statement_lines")
    op.drop_column("bank_statement_lines", "dedup_key")
    op.alter_column(
        "bank_statements",
        "storage_path",
        existing_type=sa.String(length=1024),
        nullable=False,
    )
