"""Extensible permission layer — Decisions §18."""

from __future__ import annotations

from enum import StrEnum

from app.core.auth.types import EntityRole


class Permission(StrEnum):
    FINANCIAL_REPORTS_READ = "financial_reports:read"
    OPERATIONS_WRITE = "operations:write"
    ADMIN_MANAGE_MEMBERS = "admin:manage_members"
    REPORTS_READ = "reports:read"


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

ROLE_PERMISSIONS: dict[EntityRole, frozenset[Permission]] = {
    EntityRole.OWNER: _FULL_ACCESS,
    EntityRole.PARTNER: _FULL_ACCESS,
    EntityRole.CASHIER: _VIEW_AND_OPS_REPORTS,
    EntityRole.PARTNER_VIEW_ONLY: _VIEW_ONLY,
}


def user_has_permission(
    role: EntityRole | str,
    permission: Permission,
    *,
    is_active: bool = True,
) -> bool:
    """Return True when the role grants the permission and the user is active."""
    if not is_active:
        return False
    resolved = EntityRole(role)
    return permission in ROLE_PERMISSIONS.get(resolved, frozenset())
