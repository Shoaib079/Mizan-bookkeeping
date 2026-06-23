"""Expense source-document columns for photo-tip intake (Slice C).

Adds the uploaded-photo reference to ``expense_entries`` so a cash tip read from a
receipt photo can be stored as a draft, deduped, and traced back to its image:

- ``source_document_fingerprint`` — SHA-256 of the uploaded bytes; unique per
  entity (NULLs stay distinct, so manual expenses without a photo never collide)
  to reject duplicate re-uploads.
- ``source_document_path`` — absolute path to the stored image.

Additive and nullable — existing expense rows are untouched; manual expenses keep
both NULL and behave exactly as before.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "047_expense_source_document"
down_revision: Union[str, None] = "046_pos_card_tips_z_report"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "expense_entries",
        sa.Column("source_document_fingerprint", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "expense_entries",
        sa.Column("source_document_path", sa.String(length=1024), nullable=True),
    )
    op.create_index(
        "ix_expense_entries_source_document_fingerprint",
        "expense_entries",
        ["source_document_fingerprint"],
    )
    op.create_unique_constraint(
        "uq_expense_entries_entity_source_fingerprint",
        "expense_entries",
        ["entity_id", "source_document_fingerprint"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_expense_entries_entity_source_fingerprint",
        "expense_entries",
        type_="unique",
    )
    op.drop_index(
        "ix_expense_entries_source_document_fingerprint",
        table_name="expense_entries",
    )
    op.drop_column("expense_entries", "source_document_path")
    op.drop_column("expense_entries", "source_document_fingerprint")
