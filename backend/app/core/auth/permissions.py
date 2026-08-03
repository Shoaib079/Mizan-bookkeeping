"""Extensible permission layer — Decisions §18.

API guards use Permission values; effective checks resolve member grants.
"""

from __future__ import annotations

from enum import StrEnum

from app.core.auth.grants import Grant, effective_grants, has_grant
from app.core.auth.types import EntityRole


class Permission(StrEnum):
    FINANCIAL_REPORTS_READ = "financial_reports:read"
    OPERATIONS_WRITE = "operations:write"
    DAILY_TRANSACTIONS_WRITE = "daily_transactions:write"
    ADMIN_MANAGE_MEMBERS = "admin:manage_members"
    REPORTS_READ = "reports:read"


_PERMISSION_TO_GRANT: dict[Permission, Grant] = {
    Permission.FINANCIAL_REPORTS_READ: Grant.FINANCIAL_REPORTS_READ,
    Permission.OPERATIONS_WRITE: Grant.OPERATIONS_WRITE,
    Permission.DAILY_TRANSACTIONS_WRITE: Grant.DAILY_TRANSACTIONS_WRITE,
    Permission.ADMIN_MANAGE_MEMBERS: Grant.ADMIN_MANAGE_MEMBERS,
    Permission.REPORTS_READ: Grant.REPORTS_READ,
}

# Legacy map — presets and tests; effective enforcement uses stored grants.
_FULL_ACCESS = frozenset(
    {
        Permission.FINANCIAL_REPORTS_READ,
        Permission.OPERATIONS_WRITE,
        Permission.ADMIN_MANAGE_MEMBERS,
        Permission.REPORTS_READ,
    }
)

_VIEW_AND_OPS_REPORTS = frozenset(
    {
        Permission.OPERATIONS_WRITE,
        Permission.REPORTS_READ,
    }
)

_VIEW_ONLY = frozenset(
    {
        Permission.FINANCIAL_REPORTS_READ,
        Permission.REPORTS_READ,
    }
)

_CASHIER_DAILY = frozenset(
    {
        Permission.DAILY_TRANSACTIONS_WRITE,
    }
)

ROLE_PERMISSIONS: dict[EntityRole, frozenset[Permission]] = {
    EntityRole.OWNER: _FULL_ACCESS | {Permission.DAILY_TRANSACTIONS_WRITE},
    EntityRole.PARTNER: _FULL_ACCESS | {Permission.DAILY_TRANSACTIONS_WRITE},
    EntityRole.CASHIER: _CASHIER_DAILY,
    EntityRole.PARTNER_VIEW_ONLY: _VIEW_ONLY,
}


def user_has_permission(
    role: EntityRole | str,
    permission: Permission,
    *,
    is_active: bool = True,
    stored_grants: list[str] | None = None,
) -> bool:
    """Return True when effective grants include the permission."""
    if not is_active:
        return False
    grants = effective_grants(role, stored_grants, is_active=True)
    grant = _PERMISSION_TO_GRANT.get(permission)
    if grant is None:
        return False
    return has_grant(grants, grant)


def membership_has_permission(
    role: EntityRole | str,
    permission: Permission,
    *,
    is_active: bool = True,
    stored_grants: list[str] | None = None,
) -> bool:
    return user_has_permission(
        role,
        permission,
        is_active=is_active,
        stored_grants=stored_grants,
    )
