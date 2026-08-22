/** Global app rules — single source of truth for grant-based UI gates.
 *
 * RULE: Every screen MUST use helpers here or useEntityAccess() — never inline checks.
 * Backend mirror: backend/app/core/auth/grants.py
 */

import {
  filterNavItemsByEntitySettings,
  filterRoutesByEntitySettings,
  type EntityNavSettings,
} from "@/lib/app-routes";
import { isoToday } from "@/lib/date-range";
import {
  hasGrant,
  recordActionGrant,
  type Grant,
} from "@/lib/member-grants";
import type { EntityRole } from "@/lib/settings-types";

export type { Grant };
export { hasGrant, grantsForRole, ROLE_PRESET_GRANTS, GRANT_GROUPS } from "@/lib/member-grants";

export function isOwner(role: EntityRole): boolean {
  return role === "owner";
}

export function canManageMembers(grants: readonly string[]): boolean {
  return hasGrant(grants, "admin:manage_members");
}

export function canManageExpenseItems(role: EntityRole): boolean {
  return isOwner(role);
}

export function canWriteOperations(grants: readonly string[]): boolean {
  return hasGrant(grants, "operations:write");
}

export function canWriteDailyTransactions(grants: readonly string[]): boolean {
  return (
    hasGrant(grants, "daily_transactions:write") ||
    hasGrant(grants, "operations:write")
  );
}

/** Generated Excel/PDF downloads — mirrors backend export_scope_guard. */
export function canExportFiles(grants: readonly string[]): boolean {
  return hasGrant(grants, "scope:export");
}

export function canReadReports(grants: readonly string[]): boolean {
  return hasGrant(grants, "reports:read");
}

export function canAccessSettings(grants: readonly string[]): boolean {
  return (
    canWriteOperations(grants) ||
    canManageMembers(grants) ||
    hasGrant(grants, "nav:settings")
  );
}

/** Bottom-tab More menu — banking hub or any directory/report/settings nav grant. */
export function hasMobileMoreTab(grants: readonly string[]): boolean {
  if (hasGrant(grants, "nav:banking")) return true;
  const moreNavGrants: Grant[] = [
    "nav:reports",
    "nav:suppliers",
    "nav:customers",
    "nav:staff",
    "nav:partners",
    "nav:settings",
    "nav:delivery",
    "nav:cards",
  ];
  return moreNavGrants.some((grant) => hasGrant(grants, grant));
}

export function canUseRecordAction(
  grants: readonly string[],
  actionId: string,
): boolean {
  if (canWriteOperations(grants)) return true;
  if (!canWriteDailyTransactions(grants)) return false;
  const required = recordActionGrant(actionId);
  if (required === null) return false;
  return hasGrant(grants, required);
}

function normalizeRoutePath(pathname: string): string {
  const base = pathname.split("?")[0]?.split("#")[0] ?? "/";
  if (base.length > 1 && base.endsWith("/")) return base.slice(0, -1);
  return base || "/";
}

function pathNavGrant(path: string): Grant | null {
  if (path === "/") return "nav:dashboard";
  if (path === "/record") return "nav:record";
  if (path.startsWith("/split")) return "nav:record";
  if (path.startsWith("/review")) return "nav:review";
  if (path.startsWith("/sales")) return "nav:sales";
  if (path.startsWith("/delivery")) return "nav:delivery";
  if (path.startsWith("/customers")) return "nav:customers";
  if (path.startsWith("/suppliers")) return "nav:suppliers";
  if (path.startsWith("/staff")) return "nav:staff";
  if (path.startsWith("/partners")) return "nav:partners";
  if (path.startsWith("/banking")) return "nav:banking";
  if (path.startsWith("/cards")) return "nav:cards";
  if (path.startsWith("/uploads")) return "nav:uploads";
  if (path.startsWith("/reports")) return "nav:reports";
  if (path.startsWith("/settings")) return "nav:settings";
  if (path.startsWith("/onboarding")) return "nav:settings";
  return null;
}

/** Profile is always reachable for signed-in members. */
export function canAccessAppPath(
  grants: readonly string[],
  pathname: string,
): boolean {
  const path = normalizeRoutePath(pathname);
  if (path === "/settings/profile") return true;
  const navGrant = pathNavGrant(path);
  if (navGrant === null) {
    return canWriteOperations(grants);
  }
  return hasGrant(grants, navGrant);
}

export function requiresLiveMonthScope(grants: readonly string[]): boolean {
  return (
    hasGrant(grants, "scope:live_month_edit_void") &&
    !hasGrant(grants, "operations:write")
  );
}

export function canModifyEntryDate(
  grants: readonly string[],
  entryDateIso: string,
  reference = new Date(),
): boolean {
  if (!requiresLiveMonthScope(grants)) return true;
  const today = isoToday(reference);
  const monthStart = `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}-01`;
  return entryDateIso >= monthStart && entryDateIso <= today;
}

export function filterAppRoutesForGrants<T extends { href: string }>(
  routes: T[],
  grants: readonly string[],
): T[] {
  return routes.filter((route) => canAccessAppPath(grants, route.href));
}

export function canReadFinancialReports(grants: readonly string[]): boolean {
  return hasGrant(grants, "financial_reports:read");
}

export function canSwitchEntity(grants: readonly string[]): boolean {
  return hasGrant(grants, "scope:switch_entity");
}

export function canCreateEntity(role: EntityRole): boolean {
  return isOwner(role);
}

export function visibleEntitiesForRole<T extends { id: string }>(
  entities: T[],
  entityId: string,
  grants: readonly string[],
): T[] {
  if (canSwitchEntity(grants)) return entities;
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

export function filterDashboardKpis(
  kpis: DashboardKpi[],
  grants: readonly string[],
): DashboardKpi[] {
  if (
    canReadFinancialReports(grants) ||
    hasGrant(grants, "scope:financial_dashboard_kpis")
  ) {
    return kpis;
  }
  return kpis.filter((kpi) => !FINANCIAL_KPI_KEYS.has(kpi.key));
}

export function shouldShowNewMenu(grants: readonly string[]): boolean {
  return canWriteDailyTransactions(grants);
}

export function shouldShowWriteChrome(grants: readonly string[]): boolean {
  return canWriteOperations(grants);
}

export function shouldShowNetResultSummary(grants: readonly string[]): boolean {
  return (
    canReadFinancialReports(grants) ||
    hasGrant(grants, "scope:financial_dashboard_kpis")
  );
}

export function filterFinancialReportCards<T extends { financial: boolean }>(
  cards: T[],
  grants: readonly string[],
): T[] {
  if (canReadFinancialReports(grants)) return cards;
  return cards.filter((card) => !card.financial);
}

export function filterDeliveryReportCards<T extends { href: string }>(
  cards: T[],
  deliveryEnabled: boolean,
): T[] {
  if (deliveryEnabled) return cards;
  return cards.filter((card) => !card.href.includes("/delivery"));
}

/** Journal sources editable under live-month scope (daily transaction posters). */
export const LIVE_MONTH_JOURNAL_SOURCES = new Set<string>([
  "pos_daily_summary",
  "manual_daily_sales",
  "expense",
  "cash_drawer_close",
]);

export function canModifyJournalSource(
  grants: readonly string[],
  source: string,
): boolean {
  if (canWriteOperations(grants)) return true;
  if (!requiresLiveMonthScope(grants)) return canWriteDailyTransactions(grants);
  return LIVE_MONTH_JOURNAL_SOURCES.has(source);
}

export { filterNavItemsByEntitySettings, filterRoutesByEntitySettings };
export type { EntityNavSettings };
