/** App shell — sidebar + top bar (DESIGN_SYSTEM.md §6). Phase 0 scaffold. */

import {
  BarChart3,
  Building2,
  CreditCard,
  FileText,
  LayoutDashboard,
  Settings,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const navGroups = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Books",
    items: [
      { href: "/uploads", label: "Uploads", icon: Upload },
      { href: "/suppliers", label: "Suppliers", icon: Users },
      { href: "/banking", label: "Banking", icon: Building2 },
      { href: "/cards", label: "Cards", icon: CreditCard },
    ],
  },
  {
    label: "Reports",
    items: [{ href: "/reports", label: "Reports", icon: BarChart3 }],
  },
  {
    label: "Settings",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="border-b border-border px-4 py-4">
          <p className="text-lg font-semibold text-primary">Mizan</p>
          <p className="text-xs text-muted-foreground">Restaurant bookkeeping</p>
        </div>
        <div className="border-b border-border px-3 py-3">
          <label className="mb-1 block text-xs text-muted-foreground">
            Entity
          </label>
          <select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
            <option>Meze Kadıköy</option>
          </select>
        </div>
        <nav className="flex-1 space-y-4 p-3">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent"
                    >
                      <item.icon className="size-4" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-6">
          <h1 className="text-sm font-semibold">Overview</h1>
          <div className="flex items-center gap-2">
            <Button variant="secondary">This month</Button>
            <Button>Upload</Button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
