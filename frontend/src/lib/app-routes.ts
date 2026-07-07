/** Static navigation routes — sidebar + command palette (DESIGN_SYSTEM §6, §10). */

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Banknote,
  BookOpen,
  Building2,
  ClipboardList,
  CreditCard,
  HandCoins,
  Handshake,
  Landmark,
  LayoutDashboard,
  ScanSearch,
  Scale,
  Settings,
  ShoppingBag,
  Tags,
  Truck,
  Upload,
  UserCircle,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";

import { SIDEBAR_HIDDEN_HREFS, sidebarHrefActiveForPathname } from "@/lib/nav-sections";

export type AppRoute = {
  href: string;
  label: string;
  keywords?: string;
  icon: LucideIcon;
  group: string;
  /** @deprecated nested sidebar removed — tabs/cards only; kept for palette indexing. */
  nestedUnder?: string;
};

export type NavGroupIcon = LucideIcon;

export type NavGroup = {
  label: string;
  icon: NavGroupIcon;
  items: AppRoute[];
};

export const appRoutes: AppRoute[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  {
    href: "/record",
    label: "Add",
    keywords: "post new record expense sales payment upload",
    icon: ClipboardList,
    group: "Overview",
  },
  {
    href: "/review",
    label: "Review",
    keywords: "needs review bank statements receipts invoices sales delivery expenses ledger",
    icon: ScanSearch,
    group: "Overview",
  },
  {
    href: "/balances",
    label: "Balances",
    keywords: "payables receivables staff partners cash bank",
    icon: Scale,
    group: "Overview",
  },
  {
    href: "/suppliers",
    label: "Suppliers",
    keywords: "supplier directory metro vkn payables",
    icon: Users,
    group: "Overview",
  },
  {
    href: "/customers",
    label: "Customers",
    keywords: "customer directory receivables credit sales",
    icon: UserCircle,
    group: "Overview",
  },
  {
    href: "/staff",
    label: "Staff",
    keywords: "employees salary advances payroll",
    icon: UsersRound,
    group: "Overview",
  },
  {
    href: "/partners",
    label: "Partners",
    keywords: "owners reimbursements fronted expenses",
    icon: Handshake,
    group: "Overview",
  },
  {
    href: "/banking",
    label: "Banking",
    keywords: "bank accounts cash drawer transfers statements",
    icon: Building2,
    group: "Overview",
  },
  {
    href: "/delivery",
    label: "Delivery",
    keywords: "delivery platforms getir yemeksepeti settlements reports",
    icon: Truck,
    group: "Overview",
  },
  { href: "/sales", label: "Sales", icon: ShoppingBag, group: "Sales" },
  {
    href: "/close-day",
    label: "Close day",
    keywords: "day close-out sales expenses",
    icon: ShoppingBag,
    group: "Sales",
  },
  { href: "/cards", label: "Cards", icon: CreditCard, group: "Sales" },
  {
    href: "/delivery/platforms",
    label: "Delivery platforms",
    keywords: "delivery platforms getir yemeksepeti trendyol",
    icon: Truck,
    group: "Sales",
    nestedUnder: "/delivery",
  },
  {
    href: "/delivery/reports",
    label: "Reports",
    keywords: "delivery reports",
    icon: Truck,
    group: "Sales",
    nestedUnder: "/delivery",
  },
  {
    href: "/delivery/settlements",
    label: "Settlements",
    keywords: "delivery settlements",
    icon: Truck,
    group: "Sales",
    nestedUnder: "/delivery",
  },
  { href: "/review/expenses", label: "Expenses", icon: Wallet, group: "Expenses & suppliers" },
  {
    href: "/uploads",
    label: "Documents",
    keywords: "uploads needs review receipts photos efatura",
    icon: Upload,
    group: "Expenses & suppliers",
  },
  { href: "/suppliers", label: "Suppliers", icon: Users, group: "Expenses & suppliers" },
  {
    href: "/balances/suppliers",
    label: "Payables",
    keywords: "supplier balances owed",
    icon: HandCoins,
    group: "Balances",
  },
  { href: "/staff", label: "Staff", icon: UsersRound, group: "People" },
  { href: "/partners", label: "Partners", icon: Handshake, group: "People" },
  { href: "/customers", label: "Customers", icon: UserCircle, group: "Customers" },
  {
    href: "/balances/customers",
    label: "Receivables",
    keywords: "customer balances owed",
    icon: Banknote,
    group: "Balances",
  },
  { href: "/banking", label: "Banking", icon: Building2, group: "Cash & bank" },
  { href: "/banking/transfers", label: "Bank transfers", icon: Building2, group: "Cash & bank" },
  { href: "/banking/cash", label: "Cash drawer", icon: Wallet, group: "Cash & bank" },
  { href: "/reports", label: "Reports", icon: BarChart3, group: "Reports" },
  {
    href: "/onboarding/opening-balances",
    label: "Opening balances",
    keywords: "go-live opening balance cash bank equity supplier",
    icon: Landmark,
    group: "Reports",
  },
  {
    href: "/reports/ledger",
    label: "General ledger",
    keywords: "journal entries ledger all entries correct manual bank charges",
    icon: BookOpen,
    group: "Reports",
    nestedUnder: "/reports",
  },
  {
    href: "/review/manual-journals",
    label: "Manual journals",
    keywords: "void manual journal",
    icon: BookOpen,
    group: "Reports",
    nestedUnder: "/reports",
  },
  {
    href: "/settings/restaurant",
    label: "Restaurant settings",
    keywords: "entity modules team toggles",
    icon: Settings,
    group: "Workspace",
  },
  {
    href: "/settings/profile",
    label: "Your profile",
    keywords: "display name user",
    icon: UserCircle,
    group: "Workspace",
  },
  {
    href: "/expenses/items",
    label: "Expense items",
    keywords: "merge duplicate items",
    icon: Tags,
    group: "Expenses & suppliers",
    nestedUnder: "/review/expenses",
  },
];

export type EntityNavSettings = {
  deliveryEnabled: boolean;
};

function isDeliveryRoute(route: AppRoute): boolean {
  return route.href.startsWith("/delivery");
}

/** Hide delivery pages when the module is off. */
export function filterRoutesByEntitySettings(
  routes: AppRoute[],
  settings: EntityNavSettings,
): AppRoute[] {
  if (settings.deliveryEnabled) return routes;
  return routes.filter((route) => !isDeliveryRoute(route));
}

export function filterNavItemsByEntitySettings(
  items: AppRoute[],
  settings: EntityNavSettings,
): AppRoute[] {
  if (settings.deliveryEnabled) return items;
  return items.filter((item) => item.href !== "/delivery");
}

const SIDEBAR_GROUP_DEFS = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Reports", icon: BarChart3 },
] as const;

function primarySidebarItems(groupLabel: string): AppRoute[] {
  return appRoutes.filter(
    (route) =>
      route.group === groupLabel &&
      !route.nestedUnder &&
      !SIDEBAR_HIDDEN_HREFS.has(route.href),
  );
}

export const navGroups: NavGroup[] = SIDEBAR_GROUP_DEFS.map(({ label, icon }) => ({
  label,
  icon,
  items: primarySidebarItems(label),
}));

/** No nested sidebar children — tabs and report cards instead. */
export function sidebarChildrenForNavItem(
  _itemHref: string,
  _settings: EntityNavSettings,
): AppRoute[] {
  void _itemHref;
  void _settings;
  return [];
}

export function isNavItemActive(pathname: string, item: AppRoute): boolean {
  return sidebarHrefActiveForPathname(item.href, pathname);
}
