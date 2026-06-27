/** Static navigation routes — sidebar + command palette (DESIGN_SYSTEM §6, §10). */

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Banknote,
  BookOpen,
  Building2,
  CreditCard,
  FileText,
  HandCoins,
  Handshake,
  LayoutDashboard,
  Receipt,
  Settings,
  ShoppingBag,
  Truck,
  Upload,
  UserCircle,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";

export type AppRoute = {
  href: string;
  label: string;
  keywords?: string;
  icon: LucideIcon;
  group: string;
  /** Nested under this parent href in the sidebar only (still indexed in command palette). */
  nestedUnder?: string;
};

export const appRoutes: AppRoute[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { href: "/sales", label: "Sales", icon: ShoppingBag, group: "Sales" },
  {
    href: "/close-day",
    label: "Close day",
    keywords: "day close-out sales expenses",
    icon: ShoppingBag,
    group: "Sales",
  },
  { href: "/cards", label: "Cards", icon: CreditCard, group: "Sales" },
  { href: "/delivery", label: "Delivery", icon: Truck, group: "Sales" },
  {
    href: "/delivery/platforms",
    label: "Platforms",
    keywords: "delivery platforms",
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
  { href: "/expenses", label: "Expenses", icon: Wallet, group: "Expenses & suppliers" },
  { href: "/uploads", label: "Uploads", icon: Upload, group: "Expenses & suppliers" },
  { href: "/suppliers", label: "Suppliers", icon: Users, group: "Expenses & suppliers" },
  { href: "/payables", label: "Payables", icon: HandCoins, group: "Expenses & suppliers" },
  { href: "/staff", label: "Staff", icon: UsersRound, group: "People" },
  { href: "/partners", label: "Partners", icon: Handshake, group: "People" },
  { href: "/customers", label: "Customers", icon: UserCircle, group: "Customers" },
  { href: "/receivables", label: "Receivables", icon: Banknote, group: "Customers" },
  { href: "/banking", label: "Banking", icon: Building2, group: "Cash & bank" },
  { href: "/banking/transfers", label: "Bank transfers", icon: Building2, group: "Cash & bank" },
  { href: "/banking/cash", label: "Cash drawer", icon: Wallet, group: "Cash & bank" },
  { href: "/reports", label: "Reports", icon: BarChart3, group: "Reports" },
  {
    href: "/reports/ledger",
    label: "General ledger",
    keywords: "journal entries ledger all entries correct manual bank fee",
    icon: BookOpen,
    group: "Reports",
    nestedUnder: "/reports",
  },
  {
    href: "/accounting/manual-journals",
    label: "Manual journals",
    keywords: "void manual journal",
    icon: BookOpen,
    group: "Reports",
    nestedUnder: "/reports",
  },
  { href: "/settings", label: "Settings", icon: Settings, group: "Settings" },
  {
    href: "/settings/entity",
    label: "Restaurant settings",
    keywords: "entity create",
    icon: Settings,
    group: "Settings",
  },
  {
    href: "/settings/opening-balances",
    label: "Opening balances",
    icon: Settings,
    group: "Settings",
  },
  {
    href: "/settings/members",
    label: "Members & roles",
    icon: Users,
    group: "Settings",
  },
  // New menu shortcuts (navigate to relevant list pages)
  { href: "/expenses", label: "New: Manual expense", keywords: "new expense", icon: Wallet, group: "New" },
  { href: "/expenses", label: "New: Cash tip", keywords: "5700 tips", icon: Wallet, group: "New" },
  { href: "/sales", label: "New: Daily sales (manual)", keywords: "pos manual", icon: ShoppingBag, group: "New" },
  { href: "/close-day", label: "New: Close day", keywords: "close-out sales expenses", icon: ShoppingBag, group: "New" },
  { href: "/sales", label: "New: POS summary (photo)", keywords: "upload z", icon: ShoppingBag, group: "New" },
  { href: "/cards", label: "New: Card sales batch", icon: CreditCard, group: "New" },
  { href: "/delivery/reports", label: "New: Delivery report", icon: Truck, group: "New" },
  { href: "/expenses", label: "New: Expense receipt (photo)", icon: Receipt, group: "New" },
  { href: "/suppliers", label: "New: Supplier", icon: Users, group: "New" },
  {
    href: "/suppliers",
    label: "New: Supplier invoice (e-Fatura)",
    keywords: "efatura upload",
    icon: FileText,
    group: "New",
  },
];

export function sidebarChildren(parentHref: string): AppRoute[] {
  return appRoutes.filter((route) => route.nestedUnder === parentHref);
}

export type EntityNavSettings = {
  deliveryEnabled: boolean;
};

function isDeliveryRoute(route: AppRoute): boolean {
  return route.href.startsWith("/delivery") || route.label === "New: Delivery report";
}

/** Hide delivery pages and New-menu shortcuts when the module is off. */
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

const SIDEBAR_GROUP_LABELS = [
  "Overview",
  "Sales",
  "Expenses & suppliers",
  "People",
  "Customers",
  "Cash & bank",
  "Reports",
  "Settings",
] as const;

function primarySidebarItems(groupLabel: string): AppRoute[] {
  return appRoutes.filter(
    (route) =>
      route.group === groupLabel &&
      !route.label.startsWith("New:") &&
      !route.nestedUnder &&
      (groupLabel !== "Settings" || route.href !== "/settings"),
  );
}

export const navGroups = SIDEBAR_GROUP_LABELS.map((label) => ({
  label,
  items: primarySidebarItems(label),
}));

/** Sidebar nested links — delivery children only when the module is on. */
export function sidebarChildrenForNavItem(
  itemHref: string,
  settings: EntityNavSettings,
): AppRoute[] {
  if (itemHref === "/delivery" && !settings.deliveryEnabled) return [];
  return sidebarChildren(itemHref);
}

function routeActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavItemActive(pathname: string, item: AppRoute): boolean {
  const children = sidebarChildren(item.href);
  if (children.length > 0) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return routeActive(pathname, item.href);
}

export function isNavChildActive(pathname: string, child: AppRoute): boolean {
  return routeActive(pathname, child.href);
}
