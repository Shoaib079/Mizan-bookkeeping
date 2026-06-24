/** Static navigation routes — sidebar + command palette (DESIGN_SYSTEM §6, §10). */

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Banknote,
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
};

export const appRoutes: AppRoute[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { href: "/sales", label: "Sales", icon: ShoppingBag, group: "Books" },
  { href: "/delivery", label: "Delivery", icon: Truck, group: "Books" },
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
  { href: "/settings", label: "Settings", icon: Settings, group: "Settings" },
  { href: "/settings/entity", label: "Restaurant settings", keywords: "entity create", icon: Settings, group: "Settings" },
  { href: "/settings/opening-balances", label: "Opening balances", icon: Settings, group: "Settings" },
  { href: "/settings/members", label: "Members & roles", icon: Users, group: "Settings" },
  { href: "/delivery/platforms", label: "Delivery platforms", icon: Truck, group: "Books" },
  { href: "/delivery/reports", label: "Delivery reports", icon: Truck, group: "Books" },
  { href: "/delivery/settlements", label: "Delivery settlements", icon: Truck, group: "Books" },
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
  { href: "/suppliers", label: "New: Supplier invoice (e-Fatura)", keywords: "efatura upload", icon: FileText, group: "New" },
];

export const navGroups = [
  { label: "Overview", items: appRoutes.filter((r) => r.group === "Overview") },
  { label: "Books", items: appRoutes.filter((r) => r.group === "Books" && !r.label.startsWith("New:")) },
  { label: "Reports", items: appRoutes.filter((r) => r.group === "Reports") },
  { label: "Settings", items: appRoutes.filter((r) => r.group === "Settings" && r.href === "/settings") },
] as const;
