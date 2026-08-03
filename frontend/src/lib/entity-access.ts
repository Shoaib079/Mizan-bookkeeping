/** Global app rules — single source of truth for role/permission UI gates.
 *
 * RULE: Every screen (desktop, mobile, dialog, menu) MUST use helpers here or
 * useEntityAccess() — never inline `role ===` checks in components.
 * Backend mirror: backend/app/core/auth/permissions.py
 *
 * Global enforcement layers:
 * - useEntityAccess() — one membership fetch per entity, shared context
 * - entity-switch-policy.ts + EntitySwitchGuard — blocks company switch globally
 * - entity-context setEntityId — respects switch policy on every code path
 */

import {
  filterNavItemsByEntitySettings,
  filterRoutesByEntitySettings,
  type EntityNavSettings,
} from "@/lib/app-routes";
import type { EntityRole } from "@/lib/settings-types";

export type Permission =
  | "financial_reports:read"
  | "operations:write"
  | "admin:manage_members"
  | "reports:read";

const FULL_ACCESS: ReadonlySet<Permission> = new Set([
  "financial_reports:read",
  "operations:write",
  "admin:manage_members",
  "reports:read",
]);

const VIEW_AND_OPS_REPORTS: ReadonlySet<Permission> = new Set([
  "operations:write",
  "reports:read",
]);

const VIEW_ONLY: ReadonlySet<Permission> = new Set([
  "financial_reports:read",
  "reports:read",
]);

/** Keep in sync with backend ROLE_PERMISSIONS. */
export const ROLE_PERMISSIONS: Record<EntityRole, ReadonlySet<Permission>> = {
  owner: FULL_ACCESS,
  partner: FULL_ACCESS,
  cashier: VIEW_AND_OPS_REPORTS,
  partner_view_only: VIEW_ONLY,
};

export function hasPermission(role: EntityRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function isOwner(role: EntityRole): boolean {
  return role === "owner";
}

export function canManageMembers(role: EntityRole): boolean {
  return hasPermission(role, "admin:manage_members");
}

export function canManageExpenseItems(role: EntityRole): boolean {
  return isOwner(role);
}

export function canWriteOperations(role: EntityRole): boolean {
  return hasPermission(role, "operations:write");
}

export function canReadFinancialReports(role: EntityRole): boolean {
  return hasPermission(role, "financial_reports:read");
}

/** Only owners may switch or create restaurants — all other roles stay on assignment. */
export function canSwitchEntity(role: EntityRole): boolean {
  return isOwner(role);
}

export function canCreateEntity(role: EntityRole): boolean {
  return isOwner(role);
}

/** Non-owners see only their assigned restaurant, not every membership on the account. */
export function visibleEntitiesForRole<T extends { id: string }>(
  entities: T[],
  entityId: string,
  role: EntityRole,
): T[] {
  if (canSwitchEntity(role)) return entities;
  const current = entities.find((entity) => entity.id === entityId);
  if (current) return [current];
  return entities.length > 0 ? [entities[0]] : [];
}

export type DashboardKpiKey =
  | "sales"
  | "expenses"
  | "net_result"
  | "payables"
  | "receivables"
  | "try_position"
  | "cash_in_hand"
  | "bank_balance"
  | "needs_review";

export type DashboardKpi = {
  key: DashboardKpiKey;
  label: string;
  value: string;
  href?: string;
};

const FINANCIAL_KPI_KEYS: ReadonlySet<DashboardKpiKey> = new Set([
  "net_result",
  "payables",
  "receivables",
  "try_position",
  "cash_in_hand",
  "bank_balance",
]);

/** Hide P&L/balance-sheet KPIs for roles without financial_reports:read. */
export function filterDashboardKpis(
  kpis: DashboardKpi[],
  role: EntityRole,
): DashboardKpi[] {
  if (canReadFinancialReports(role)) return kpis;
  return kpis.filter((kpi) => !FINANCIAL_KPI_KEYS.has(kpi.key));
}

export function shouldShowNewMenu(role: EntityRole): boolean {
  return canWriteOperations(role);
}

export function shouldShowWriteChrome(role: EntityRole): boolean {
  return canWriteOperations(role);
}

export function shouldShowNetResultSummary(role: EntityRole): boolean {
  return canReadFinancialReports(role);
}

export function filterFinancialReportCards<T extends { financial: boolean }>(
  cards: T[],
  role: EntityRole,
): T[] {
  if (canReadFinancialReports(role)) return cards;
  return cards.filter((card) => !card.financial);
}

export function filterDeliveryReportCards<T extends { href: string }>(
  cards: T[],
  deliveryEnabled: boolean,
): T[] {
  if (deliveryEnabled) return cards;
  return cards.filter((card) => !card.href.includes("/delivery"));
}

export { filterNavItemsByEntitySettings, filterRoutesByEntitySettings };
export type { EntityNavSettings };
