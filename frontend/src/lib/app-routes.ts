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
  { href: "/sales", label: "Sales", icon: ShoppingBag, group: "Books" },
  { href: "/delivery", label: "Delivery", icon: Truck, group: "Books" },
  {
    href: "/delivery/platforms",
    label: "Platforms",
    keywords: "delivery platforms",
    icon: Truck,
    group: "Books",
    nestedUnder: "/delivery",
  },
  {
    href: "/delivery/reports",
    label: "Reports",
    keywords: "delivery reports",
    icon: Truck,
    group: "Books",
    nestedUnder: "/delivery",
  },
  {
    href: "/delivery/settlements",
    label: "Settlements",
    keywords: "delivery settlements",
    icon: Truck,
    group: "Books",
    nestedUnder: "/delivery",
  },
  { href: "/expenses", label: "Expenses", icon: Wallet, group: "Books" },
  { href: "/uploads", label: "Uploads", icon: Upload, group: "Books" },
  { href: "/suppliers", label: "Suppliers", icon: Users, group: "Books" },
  { href: "/payables", label: "Payables", icon: HandCoins, group: "Books" },
  { href: "/staff", label: "Staff", icon: UsersRound, group: "Books" },
  { href: "/partners", label: "Partners", icon: Handshake, group: "Books" },
  { href: "/customers", label: "Customers", icon: UserCircle, group: "Books" },
  { href: "/receivables", label: "Receivables", icon: Banknote, group: "Books" },
  { href: "/banking", label: "Banking", icon: Building2, group: "Books" },
  { href: "/cards", label: "Cards", icon: CreditCard, group: "Books" },
  { href: "/reports", label: "Reports", icon: BarChart3, group: "Reports" },
  {
    href: "/reports/ledger",
    label: "Ledger entries",
    keywords: "journal correct manual bank fee",
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
  { href: "/banking/transfers", label: "Bank transfers", icon: Building2, group: "Books" },
  { href: "/banking/cash", label: "Cash drawer", icon: Wallet, group: "Books" },
  // New menu shortcuts (navigate to relevant list pages)
  { href: "/expenses", label: "New: Manual expense", keywords: "new expense", icon: Wallet, group: "New" },
  { href: "/expenses", label: "New: Cash tip", keywords: "5700 tips", icon: Wallet, group: "New" },
  { href: "/sales", label: "New: Daily sales (manual)", keywords: "pos manual", icon: ShoppingBag, group: "New" },
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

export const navGroups = [
  { label: "Overview", items: appRoutes.filter((route) => route.group === "Overview") },
  {
    label: "Books",
    items: appRoutes.filter(
      (route) =>
        route.group === "Books" &&
        !route.label.startsWith("New:") &&
        !route.nestedUnder,
    ),
  },
  { label: "Reports", items: appRoutes.filter((route) => route.group === "Reports") },
  {
    label: "Settings",
    items: appRoutes.filter(
      (route) => route.group === "Settings" && route.href === "/settings",
    ),
  },
] as const;

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
