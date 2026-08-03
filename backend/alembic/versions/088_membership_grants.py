"""Add per-member custom access grants (Decisions §18 Option B)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "088_membership_grants"
down_revision: Union[str, None] = "087_drop_cash_drawer_denomination_count"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Preset grant lists — keep in sync with backend/app/core/auth/grants.py
_OWNER = [
    "admin:manage_members",
    "daily_transactions:write",
    "financial_reports:read",
    "nav:banking",
    "nav:cards",
    "nav:customers",
    "nav:dashboard",
    "nav:delivery",
    "nav:partners",
    "nav:record",
    "nav:reports",
    "nav:review",
    "nav:sales",
    "nav:settings",
    "nav:staff",
    "nav:suppliers",
    "nav:uploads",
    "operations:write",
    "record:close_day",
    "record:count_cash",
    "record:expense",
    "record:sales",
    "reports:read",
    "scope:export",
    "scope:financial_dashboard_kpis",
    "scope:switch_entity",
]

_PARTNER = [g for g in _OWNER if g != "scope:switch_entity"]

_CASHIER = [
    "daily_transactions:write",
    "nav:dashboard",
    "nav:record",
    "nav:sales",
    "record:close_day",
    "record:count_cash",
    "record:expense",
    "record:sales",
    "scope:live_month_edit_void",
]

_VIEW_ONLY = [
    "financial_reports:read",
    "nav:banking",
    "nav:cards",
    "nav:customers",
    "nav:dashboard",
    "nav:delivery",
    "nav:partners",
    "nav:record",
    "nav:reports",
    "nav:review",
    "nav:sales",
    "nav:settings",
    "nav:staff",
    "nav:suppliers",
    "nav:uploads",
    "reports:read",
    "scope:export",
    "scope:financial_dashboard_kpis",
]


def _json_array(values: list[str]) -> str:
    escaped = ", ".join(f'"{v}"' for v in values)
    return f"'[{escaped}]'::jsonb"


def upgrade() -> None:
    op.add_column(
        "entity_memberships",
        sa.Column("grants", sa.dialects.postgresql.JSONB(), nullable=True),
    )
    op.execute(
        f"UPDATE entity_memberships SET grants = {_json_array(_OWNER)} "
        "WHERE role = 'owner'"
    )
    op.execute(
        f"UPDATE entity_memberships SET grants = {_json_array(_PARTNER)} "
        "WHERE role = 'partner'"
    )
    op.execute(
        f"UPDATE entity_memberships SET grants = {_json_array(_CASHIER)} "
        "WHERE role = 'cashier'"
    )
    op.execute(
        f"UPDATE entity_memberships SET grants = {_json_array(_VIEW_ONLY)} "
        "WHERE role = 'partner_view_only'"
    )


def downgrade() -> None:
    op.drop_column("entity_memberships", "grants")
