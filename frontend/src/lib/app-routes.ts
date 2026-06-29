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
  Tags,
  Truck,
  Upload,
  UserCircle,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";

import type { QuickActionKey } from "@/components/quick-actions";
import { SIDEBAR_HIDDEN_HREFS, sidebarHrefActiveForPathname } from "@/lib/nav-sections";

export type AppRoute = {
  href: string;
  label: string;
  keywords?: string;
  icon: LucideIcon;
  group: string;
  /** @deprecated nested sidebar removed — tabs/cards only; kept for palette indexing. */
  nestedUnder?: string;
  /** Command palette: open modal instead of navigating. */
  quickAction?: QuickActionKey;
};

export type NavGroupIcon = LucideIcon;

export type NavGroup = {
  label: string;
  icon: NavGroupIcon;
  items: AppRoute[];
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
  {
    href: "/uploads",
    label: "Documents",
    keywords: "uploads needs review receipts photos efatura",
    icon: Upload,
    group: "Expenses & suppliers",
  },
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
  {
    href: "/settings/expense-items",
    label: "Expense items",
    keywords: "merge duplicate items",
    icon: Tags,
    group: "Settings",
  },
  {
    href: "/expenses",
    label: "New: Manual expense",
    keywords: "new expense",
    icon: Wallet,
    group: "New",
    quickAction: "expense",
  },
  {
    href: "/sales",
    label: "New: Daily sales (manual)",
    keywords: "pos manual",
    icon: ShoppingBag,
    group: "New",
    quickAction: "sales",
  },
  {
    href: "/banking",
    label: "New: Buy foreign currency",
    keywords: "fx forex usd eur gbp",
    icon: Banknote,
    group: "New",
    quickAction: "buyFx",
  },
  {
    href: "/close-day",
    label: "New: Close day",
    keywords: "close-out sales expenses",
    icon: ShoppingBag,
    group: "New",
  },
  {
    href: "/sales",
    label: "New: POS summary (photo)",
    keywords: "upload z",
    icon: ShoppingBag,
    group: "New",
    quickAction: "posPhoto",
  },
  {
    href: "/delivery/reports",
    label: "New: Delivery report",
    icon: Truck,
    group: "New",
    quickAction: "deliveryReport",
  },
  {
    href: "/expenses",
    label: "New: Expense receipt (photo)",
    icon: Receipt,
    group: "New",
    quickAction: "receipt",
  },
  {
    href: "/suppliers",
    label: "New: Supplier",
    icon: Users,
    group: "New",
    quickAction: "supplier",
  },
  {
    href: "/suppliers",
    label: "New: Supplier invoice (e-Fatura)",
    keywords: "efatura upload",
    icon: FileText,
    group: "New",
    quickAction: "efatura",
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

const SIDEBAR_GROUP_DEFS = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Sales", icon: ShoppingBag },
  { label: "Expenses & suppliers", icon: Wallet },
  { label: "People", icon: UsersRound },
  { label: "Customers", icon: UserCircle },
  { label: "Cash & bank", icon: Building2 },
  { label: "Reports", icon: BarChart3 },
  { label: "Settings", icon: Settings },
] as const;

function primarySidebarItems(groupLabel: string): AppRoute[] {
  return appRoutes.filter(
    (route) =>
      route.group === groupLabel &&
      !route.label.startsWith("New:") &&
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

export function isNavChildActive(pathname: string, child: AppRoute): boolean {
  return pathname === child.href || pathname.startsWith(`${child.href}/`);
}

export function navGroupIcon(label: string): NavGroupIcon | undefined {
  return SIDEBAR_GROUP_DEFS.find((group) => group.label === label)?.icon;
}
