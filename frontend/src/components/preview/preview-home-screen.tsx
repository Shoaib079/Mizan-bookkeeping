"use client";

import { ShoppingBag, Wallet } from "lucide-react";

import { StatCard } from "@/components/page/stat-card";
import { MeaningChip } from "@/components/ui/meaning-chip";
import {
  PeriodSegmentedChips,
  type PeriodPreset,
} from "@/components/ui/period-segmented-chips";
import { PREVIEW_RESTAURANT } from "@/components/preview/preview-sample-data";

export function PreviewHomeScreen({
  period,
  onPeriodChange,
  onPreviewOnly,
}: {
  period: PeriodPreset;
  onPeriodChange: (next: PeriodPreset) => void;
  onPreviewOnly: (label: string) => void;
}) {
  return (
    <div className="space-y-5" data-preview-screen="home">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">
          Preview only — not live
        </p>
        <h1 className="text-xl font-semibold">Good afternoon</h1>
        <span className="inline-flex rounded-full border border-border bg-card px-3 py-1 text-xs font-medium">
          {PREVIEW_RESTAURANT}
        </span>
        <p className="text-sm text-muted-foreground">
          Mobile visual refresh v2 — walk through with sample Turkish figures.
        </p>
      </header>

      <PeriodSegmentedChips value={period} onChange={onPeriodChange} />

      <div className="grid gap-3 grid-cols-2">
        <StatCard
          label="Sales"
          icon={ShoppingBag}
          amountKurus={1_245_000_00}
          trend={{ value: "+12%", direction: "up" }}
        />
        <StatCard
          label="Expenses"
          icon={Wallet}
          amountKurus={892_500_00}
          tone="bad"
          trend={{ value: "+4%", direction: "up" }}
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Right now
        </h2>
        <div className="flex flex-wrap gap-2">
          <MeaningChip tone="in">Cash in</MeaningChip>
          <MeaningChip tone="out">Cash out</MeaningChip>
          <MeaningChip tone="attention">Needs review</MeaningChip>
          <MeaningChip tone="neutral">Card clearing</MeaningChip>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick actions
        </h2>
        <div className="flex flex-wrap gap-2">
          {["Expense", "Daily sales", "Count cash"].map((label) => (
            <button
              key={label}
              type="button"
              className="rounded-full border border-border bg-card px-3 py-2 text-xs font-medium"
              onClick={() => onPreviewOnly(label)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
