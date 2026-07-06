"""Store employee_id and partner_id on bank statement lines."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "078_statement_line_party_employee"
down_revision: Union[str, None] = "077_staff_extra_days"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bank_statement_lines",
        sa.Column("employee_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "bank_statement_lines",
        sa.Column("partner_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_bank_statement_lines_employee_id",
        "bank_statement_lines",
        "employees",
        ["employee_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_bank_statement_lines_partner_id",
        "bank_statement_lines",
        "partners",
        ["partner_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_bank_statement_lines_employee_id",
        "bank_statement_lines",
        ["employee_id"],
    )
    op.create_index(
        "ix_bank_statement_lines_partner_id",
        "bank_statement_lines",
        ["partner_id"],
    )

    op.execute(
        """
        UPDATE bank_statement_lines AS bsl
        SET employee_id = sle.employee_id
        FROM staff_ledger_entries AS sle
        WHERE bsl.journal_entry_id = sle.journal_entry_id
          AND bsl.employee_id IS NULL
          AND bsl.classification IN (
            'staff_payment', 'staff_advance', 'staff_incentive'
          )
          AND sle.movement_type IN (
            'salary_payment', 'advance_paid', 'incentive_paid'
          )
        """
    )

    op.execute(
        """
        UPDATE bank_statement_lines AS bsl
        SET partner_id = ple.partner_id
        FROM partner_ledger_entries AS ple
        WHERE bsl.journal_entry_id = ple.journal_entry_id
          AND bsl.partner_id IS NULL
          AND bsl.classification IN (
            'partner_drawing',
            'partner_reimbursement',
            'partner_drawing_repayment'
          )
        """
    )


def downgrade() -> None:
    op.drop_index("ix_bank_statement_lines_partner_id", "bank_statement_lines")
    op.drop_index("ix_bank_statement_lines_employee_id", "bank_statement_lines")
    op.drop_constraint(
        "fk_bank_statement_lines_partner_id",
        "bank_statement_lines",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_bank_statement_lines_employee_id",
        "bank_statement_lines",
        type_="foreignkey",
    )
    op.drop_column("bank_statement_lines", "partner_id")
    op.drop_column("bank_statement_lines", "employee_id")
