import { FileText } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";

export default function HomePage() {
  return (
    <AppShell>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Sales (MTD)", value: "842.350,00 ₺" },
          { label: "Expenses (MTD)", value: "612.180,00 ₺" },
          { label: "Payables", value: "128.450,00 ₺" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-lg border border-border bg-card p-4"
          >
            <p className="text-sm text-muted-foreground">{kpi.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="size-[18px] text-primary" />
          <h2 className="font-semibold">Phase 0 scaffold</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          App shell and design tokens are wired. Ledger core and real data land in
          Phase 1.
        </p>
      </div>
    </AppShell>
  );
}
