"""Per-member access grants — Decisions §18 Option B (custom grants per restaurant).

Canonical catalog lives here; frontend mirror: frontend/src/lib/member-grants.ts
"""

from __future__ import annotations

from enum import StrEnum

from app.core.auth.types import EntityRole


class Grant(StrEnum):
    """Every grant an owner may assign to a member."""

    # API-level (backend guards)
    FINANCIAL_REPORTS_READ = "financial_reports:read"
    OPERATIONS_WRITE = "operations:write"
    DAILY_TRANSACTIONS_WRITE = "daily_transactions:write"
    ADMIN_MANAGE_MEMBERS = "admin:manage_members"
    REPORTS_READ = "reports:read"

    # Navigation — what app areas are visible
    NAV_DASHBOARD = "nav:dashboard"
    NAV_RECORD = "nav:record"
    NAV_REVIEW = "nav:review"
    NAV_SALES = "nav:sales"
    NAV_DELIVERY = "nav:delivery"
    NAV_CUSTOMERS = "nav:customers"
    NAV_SUPPLIERS = "nav:suppliers"
    NAV_STAFF = "nav:staff"
    NAV_PARTNERS = "nav:partners"
    NAV_BANKING = "nav:banking"
    NAV_CARDS = "nav:cards"
    NAV_UPLOADS = "nav:uploads"
    NAV_REPORTS = "nav:reports"
    NAV_SETTINGS = "nav:settings"

    # Record hub actions (when nav:record is granted)
    RECORD_SALES = "record:sales"
    RECORD_EXPENSE = "record:expense"
    RECORD_COUNT_CASH = "record:count_cash"
    RECORD_CLOSE_DAY = "record:close_day"

    # Scopes and capabilities
    SCOPE_LIVE_MONTH_EDIT_VOID = "scope:live_month_edit_void"
    SCOPE_SWITCH_ENTITY = "scope:switch_entity"
    SCOPE_FINANCIAL_DASHBOARD_KPIS = "scope:financial_dashboard_kpis"
    SCOPE_EXPORT = "scope:export"


ALL_NAV_GRANTS: frozenset[Grant] = frozenset(
    {
        Grant.NAV_DASHBOARD,
        Grant.NAV_RECORD,
        Grant.NAV_REVIEW,
        Grant.NAV_SALES,
        Grant.NAV_DELIVERY,
        Grant.NAV_CUSTOMERS,
        Grant.NAV_SUPPLIERS,
        Grant.NAV_STAFF,
        Grant.NAV_PARTNERS,
        Grant.NAV_BANKING,
        Grant.NAV_CARDS,
        Grant.NAV_UPLOADS,
        Grant.NAV_REPORTS,
        Grant.NAV_SETTINGS,
    }
)

ALL_RECORD_GRANTS: frozenset[Grant] = frozenset(
    {
        Grant.RECORD_SALES,
        Grant.RECORD_EXPENSE,
        Grant.RECORD_COUNT_CASH,
        Grant.RECORD_CLOSE_DAY,
    }
)

ALL_API_GRANTS: frozenset[Grant] = frozenset(
    {
        Grant.FINANCIAL_REPORTS_READ,
        Grant.OPERATIONS_WRITE,
        Grant.DAILY_TRANSACTIONS_WRITE,
        Grant.ADMIN_MANAGE_MEMBERS,
        Grant.REPORTS_READ,
    }
)

ALL_SCOPE_GRANTS: frozenset[Grant] = frozenset(
    {
        Grant.SCOPE_LIVE_MONTH_EDIT_VOID,
        Grant.SCOPE_SWITCH_ENTITY,
        Grant.SCOPE_FINANCIAL_DASHBOARD_KPIS,
        Grant.SCOPE_EXPORT,
    }
)

ALL_GRANTS: frozenset[Grant] = frozenset(
    ALL_API_GRANTS | ALL_NAV_GRANTS | ALL_RECORD_GRANTS | ALL_SCOPE_GRANTS
)

_OWNER_GRANTS: frozenset[Grant] = ALL_GRANTS

_PARTNER_GRANTS: frozenset[Grant] = ALL_GRANTS - {Grant.SCOPE_SWITCH_ENTITY}

_CASHIER_GRANTS: frozenset[Grant] = frozenset(
    {
        Grant.NAV_DASHBOARD,
        Grant.NAV_RECORD,
        Grant.NAV_SALES,
        Grant.DAILY_TRANSACTIONS_WRITE,
        Grant.RECORD_SALES,
        Grant.RECORD_EXPENSE,
        Grant.RECORD_COUNT_CASH,
        Grant.RECORD_CLOSE_DAY,
        Grant.SCOPE_LIVE_MONTH_EDIT_VOID,
    }
)

_VIEW_ONLY_GRANTS: frozenset[Grant] = frozenset(
    ALL_NAV_GRANTS
    | {
        Grant.FINANCIAL_REPORTS_READ,
        Grant.REPORTS_READ,
        Grant.SCOPE_FINANCIAL_DASHBOARD_KPIS,
        # scope:export deliberately omitted — view-only may read, not download
    }
)

ROLE_PRESET_GRANTS: dict[EntityRole, frozenset[Grant]] = {
    EntityRole.OWNER: _OWNER_GRANTS,
    EntityRole.PARTNER: _PARTNER_GRANTS,
    EntityRole.CASHIER: _CASHIER_GRANTS,
    EntityRole.PARTNER_VIEW_ONLY: _VIEW_ONLY_GRANTS,
}


def grants_for_role(role: EntityRole | str) -> frozenset[Grant]:
    resolved = EntityRole(role)
    return ROLE_PRESET_GRANTS.get(resolved, frozenset())


def grants_to_strings(grants: frozenset[Grant]) -> list[str]:
    return sorted(g.value for g in grants)


def parse_grants(raw: list[str] | None) -> frozenset[Grant]:
    if not raw:
        return frozenset()
    parsed: set[Grant] = set()
    for item in raw:
        try:
            parsed.add(Grant(item))
        except ValueError:
            continue
    return frozenset(parsed)


def effective_grants(
    role: EntityRole | str,
    stored_grants: list[str] | None,
    *,
    is_active: bool = True,
) -> frozenset[Grant]:
    """Resolve stored grants; fall back to role preset when unset (legacy rows).

    Owners always receive the full owner preset — their access is not configurable.
    """
    if not is_active:
        return frozenset()
    resolved = EntityRole(role)
    if resolved == EntityRole.OWNER:
        return grants_for_role(EntityRole.OWNER)
    if stored_grants is not None and len(stored_grants) > 0:
        return parse_grants(stored_grants)
    return grants_for_role(resolved)


def has_grant(
    grants: frozenset[Grant],
    grant: Grant | str,
) -> bool:
    try:
        resolved = Grant(grant)
    except ValueError:
        return False
    return resolved in grants


class InvalidGrantsError(ValueError):
    """Raised when grant list contains unknown values or violates invariants."""


def validate_grants(
    grants: list[str],
    *,
    role: EntityRole | str | None = None,
) -> list[str]:
    """Validate and normalize a grant list for persistence."""
    if not grants:
        raise InvalidGrantsError("At least one access grant is required")

    normalized: set[str] = set()
    unknown: list[str] = []
    for item in grants:
        key = item.strip()
        if not key:
            continue
        try:
            normalized.add(Grant(key).value)
        except ValueError:
            unknown.append(key)

    if unknown:
        raise InvalidGrantsError(f"Unknown grants: {', '.join(sorted(unknown))}")

    if not normalized:
        raise InvalidGrantsError("At least one access grant is required")

    parsed = parse_grants(sorted(normalized))

    # Daily-only posters must stay within live month unless they have full ops write.
    if (
        Grant.DAILY_TRANSACTIONS_WRITE in parsed
        and Grant.OPERATIONS_WRITE not in parsed
        and Grant.SCOPE_LIVE_MONTH_EDIT_VOID not in parsed
    ):
        raise InvalidGrantsError(
            "Daily transaction access requires scope:live_month_edit_void "
            "unless operations:write is granted"
        )

    return sorted(normalized)


def record_action_grant(action_id: str) -> Grant | None:
    """Map Record hub action ids to grants."""
    mapping = {
        "sales": Grant.RECORD_SALES,
        "expense": Grant.RECORD_EXPENSE,
        "countCash": Grant.RECORD_COUNT_CASH,
        "closeDay": Grant.RECORD_CLOSE_DAY,
    }
    return mapping.get(action_id)
