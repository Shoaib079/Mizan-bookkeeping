"""Staff employees + ledger; Salaries Payable chart account; FX spend type (Decisions §16)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.staff_immutability import apply_staff_immutability

revision: str = "025_staff"
down_revision: Union[str, None] = "024_fx_purchase"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "employees",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=512), nullable=False),
        sa.Column(
            "pay_currency",
            sa.Enum("TRY", "USD", "EUR", "GBP", name="pay_currency", native_enum=False, length=3),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("notes", sa.String(length=2048), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_employees_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employees")),
    )
    op.create_index(op.f("ix_employees_entity_id"), "employees", ["entity_id"])

    op.create_table(
        "staff_ledger_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("movement_date", sa.Date(), nullable=False),
        sa.Column(
            "movement_type",
            sa.Enum(
                "opening_balance",
                "salary_accrued",
                "advance_paid",
                "salary_payment",
                name="staff_movement_type",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("try_cost_kurus", sa.Integer(), nullable=True),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("reference_type", sa.String(length=64), nullable=True),
        sa.Column("reference_id", sa.Uuid(), nullable=True),
        sa.Column("journal_entry_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["employee_id"],
            ["employees.id"],
            name=op.f("fk_staff_ledger_entries_employee_id_employees"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.id"],
            name=op.f("fk_staff_ledger_entries_entity_id_entities"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["journal_entry_id"],
            ["journal_entries.id"],
            name=op.f("fk_staff_ledger_entries_journal_entry_id_journal_entries"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_staff_ledger_entries")),
    )
    op.create_index(
        op.f("ix_staff_ledger_entries_entity_id"),
        "staff_ledger_entries",
        ["entity_id"],
    )
    op.create_index(
        op.f("ix_staff_ledger_entries_employee_id"),
        "staff_ledger_entries",
        ["employee_id"],
    )
    op.create_index(
        op.f("ix_staff_ledger_entries_journal_entry_id"),
        "staff_ledger_entries",
        ["journal_entry_id"],
    )

    op.execute("ALTER TABLE employees ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE employees FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY employees_entity_isolation ON employees
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )

    op.execute("ALTER TABLE staff_ledger_entries ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE staff_ledger_entries FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY staff_ledger_entries_entity_isolation ON staff_ledger_entries
        FOR ALL
        USING (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        WITH CHECK (
            entity_id = NULLIF(current_setting('app.current_entity_id', true), '')::uuid
        )
        """
    )

    bind = op.get_bind()
    apply_staff_immutability(bind)

    op.execute(
        """
        INSERT INTO accounts (
            id, entity_id, code, name_en, name_tr, account_type, normal_balance,
            accepts_opening_balance, is_active, created_at
        )
        SELECT
            gen_random_uuid(),
            e.id,
            '2250',
            'Salaries Payable',
            'Ödenecek Maaşlar',
            'liability',
            'credit',
            true,
            true,
            NOW()
        FROM entities e
        WHERE NOT EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.entity_id = e.id AND a.code = '2250'
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS staff_ledger_entries_immutable ON staff_ledger_entries")
    op.execute("DROP FUNCTION IF EXISTS prevent_staff_ledger_entry_mutation()")
    op.execute("DROP POLICY IF EXISTS staff_ledger_entries_entity_isolation ON staff_ledger_entries")
    op.execute("DROP POLICY IF EXISTS employees_entity_isolation ON employees")
    op.drop_index(op.f("ix_staff_ledger_entries_journal_entry_id"), table_name="staff_ledger_entries")
    op.drop_index(op.f("ix_staff_ledger_entries_employee_id"), table_name="staff_ledger_entries")
    op.drop_index(op.f("ix_staff_ledger_entries_entity_id"), table_name="staff_ledger_entries")
    op.drop_table("staff_ledger_entries")
    op.execute("DROP TYPE IF EXISTS staff_movement_type")
    op.drop_index(op.f("ix_employees_entity_id"), table_name="employees")
    op.drop_table("employees")
    op.execute("DROP TYPE IF EXISTS pay_currency")
