/** Per-member access grants — mirror backend/app/core/auth/grants.py */

import type { EntityRole } from "@/lib/settings-types";

export type Grant =
  | "financial_reports:read"
  | "operations:write"
  | "daily_transactions:write"
  | "admin:manage_members"
  | "reports:read"
  | "nav:dashboard"
  | "nav:record"
  | "nav:review"
  | "nav:sales"
  | "nav:delivery"
  | "nav:customers"
  | "nav:suppliers"
  | "nav:staff"
  | "nav:partners"
  | "nav:banking"
  | "nav:cards"
  | "nav:uploads"
  | "nav:reports"
  | "nav:settings"
  | "record:sales"
  | "record:expense"
  | "record:count_cash"
  | "record:close_day"
  | "scope:live_month_edit_void"
  | "scope:switch_entity"
  | "scope:financial_dashboard_kpis"
  | "scope:export";

export type GrantGroup = {
  id: string;
  label: string;
  description?: string;
  grants: { value: Grant; label: string; description?: string }[];
};

export const GRANT_GROUPS: GrantGroup[] = [
  {
    id: "api",
    label: "Core capabilities",
    grants: [
      {
        value: "operations:write",
        label: "Full posting",
        description: "Invoices, payables, banking, journals, and all record actions",
      },
      {
        value: "daily_transactions:write",
        label: "Daily transactions",
        description: "POS sales, cash expenses, count cash, close day",
      },
      {
        value: "financial_reports:read",
        label: "Financial reports",
        description: "P&L, balance sheet, cash flow, period comparison",
      },
      {
        value: "reports:read",
        label: "Operational reports",
        description: "KDV, delivery, registers, ledger views",
      },
      {
        value: "admin:manage_members",
        label: "Manage team & access",
      },
    ],
  },
  {
    id: "nav",
    label: "Pages they can open",
    grants: [
      { value: "nav:dashboard", label: "Dashboard" },
      { value: "nav:record", label: "Record" },
      { value: "nav:review", label: "Needs review" },
      { value: "nav:sales", label: "Sales" },
      { value: "nav:delivery", label: "Delivery" },
      { value: "nav:customers", label: "Customers" },
      { value: "nav:suppliers", label: "Suppliers" },
      { value: "nav:staff", label: "Staff" },
      { value: "nav:partners", label: "Partners" },
      { value: "nav:banking", label: "Banking" },
      { value: "nav:cards", label: "Card clearing" },
      { value: "nav:uploads", label: "Uploads" },
      { value: "nav:reports", label: "Reports" },
      { value: "nav:settings", label: "Settings & setup" },
    ],
  },
  {
    id: "record",
    label: "Record hub actions",
    description: "Only applies when Record is enabled and full posting is off",
    grants: [
      { value: "record:sales", label: "Daily sales" },
      { value: "record:expense", label: "Cash expenses" },
      { value: "record:count_cash", label: "Count cash" },
      { value: "record:close_day", label: "Close day" },
    ],
  },
  {
    id: "scope",
    label: "Rules & limits",
    grants: [
      {
        value: "scope:live_month_edit_void",
        label: "Live month only",
        description: "Edit and void only in the current calendar month",
      },
      {
        value: "scope:financial_dashboard_kpis",
        label: "Financial dashboard KPIs",
        description: "Net result, payables, bank balance on dashboard",
      },
      {
        value: "scope:export",
        label: "Export reports",
      },
      {
        value: "scope:switch_entity",
        label: "Switch restaurants",
        description: "See and switch between all restaurants on the account",
      },
    ],
  },
];

const ALL_GRANTS: ReadonlySet<Grant> = new Set(
  GRANT_GROUPS.flatMap((group) => group.grants.map((g) => g.value)),
);

const OWNER_GRANTS: ReadonlySet<Grant> = ALL_GRANTS;

const PARTNER_GRANTS: ReadonlySet<Grant> = new Set(
  [...ALL_GRANTS].filter((g) => g !== "scope:switch_entity"),
);

const CASHIER_GRANTS: ReadonlySet<Grant> = new Set([
  "nav:dashboard",
  "nav:record",
  "nav:sales",
  "daily_transactions:write",
  "record:sales",
  "record:expense",
  "record:count_cash",
  "record:close_day",
  "scope:live_month_edit_void",
]);

const VIEW_ONLY_GRANTS: ReadonlySet<Grant> = new Set([
  "financial_reports:read",
  "reports:read",
  "scope:financial_dashboard_kpis",
  "scope:export",
  "nav:dashboard",
  "nav:record",
  "nav:review",
  "nav:sales",
  "nav:delivery",
  "nav:customers",
  "nav:suppliers",
  "nav:staff",
  "nav:partners",
  "nav:banking",
  "nav:cards",
  "nav:uploads",
  "nav:reports",
  "nav:settings",
]);

export const ROLE_PRESET_GRANTS: Record<EntityRole, ReadonlySet<Grant>> = {
  owner: OWNER_GRANTS,
  partner: PARTNER_GRANTS,
  cashier: CASHIER_GRANTS,
  partner_view_only: VIEW_ONLY_GRANTS,
};

export function grantsForRole(role: EntityRole): Grant[] {
  return [...ROLE_PRESET_GRANTS[role]];
}

/** Owners grant access to others — their own access is fixed, not edited per member. */
export function isOwnerRole(role: EntityRole): boolean {
  return role === "owner";
}

export function hasGrant(grants: readonly string[], grant: Grant): boolean {
  return grants.includes(grant);
}

export function recordActionGrant(actionId: string): Grant | null {
  const map: Record<string, Grant> = {
    sales: "record:sales",
    expense: "record:expense",
    countCash: "record:count_cash",
    closeDay: "record:close_day",
  };
  return map[actionId] ?? null;
}

export function validateGrantSelection(
  grants: readonly string[],
  _role?: EntityRole,
): string | null {
  if (grants.length === 0) {
    return "Select at least one access item.";
  }
  for (const g of grants) {
    if (!ALL_GRANTS.has(g as Grant)) {
      return `Unknown grant: ${g}`;
    }
  }
  if (
    hasGrant(grants, "daily_transactions:write") &&
    !hasGrant(grants, "operations:write") &&
    !hasGrant(grants, "scope:live_month_edit_void")
  ) {
    return "Daily transaction access requires Live month only unless Full posting is enabled.";
  }
  return null;
}
