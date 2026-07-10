/** Role/permission helpers — mirror backend permissions.py (Slice 11.21). */

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

export function canWriteOperations(role: EntityRole): boolean {
  return hasPermission(role, "operations:write");
}

export function canReadFinancialReports(role: EntityRole): boolean {
  return hasPermission(role, "financial_reports:read");
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
