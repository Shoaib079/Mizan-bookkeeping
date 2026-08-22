"use client";

/** Live component gallery for mobile visual refresh v2 — preview route only. */

import { useState } from "react";
import {
  ArrowUpRight,
  Banknote,
  Building2,
  LayoutDashboard,
  Menu,
  Plus,
  ScanSearch,
  ShoppingBag,
  Wallet,
} from "lucide-react";

import { EntityBalanceSticker } from "@/components/entity-balance-sticker";
import { EditedBadge } from "@/components/ledger/corrected-badge";
import { VoidConfirmDialog } from "@/components/ledger/void-confirm-dialog";
import { MobileSettingsHub } from "@/components/layout/mobile-settings-hub";
import { StatCard } from "@/components/page/stat-card";
import { MeaningChip } from "@/components/ui/meaning-chip";
import {
  customerBalanceHeading,
  customerBalanceStickerMinor,
} from "@/lib/customer-balance";
import { formatFxNative } from "@/lib/fx-money";
import { supplierBalanceHeading } from "@/lib/supplier-balance";
import {
  MobileCardList,
  MobileCardRow,
} from "@/components/ui/mobile-card-list";
import { PeriodSegmentedChips, type PeriodPreset } from "@/components/ui/period-segmented-chips";
import { StatusBadge } from "@/components/ui/status-badge";
import { DeskModeButton } from "@/components/record/record-desk-buttons";
import { RECORD_ACTIONS } from "@/lib/record-actions";
import { formatTry } from "@/lib/money";
import { themeV2Props } from "@/lib/theme-v2";
import { cn } from "@/lib/utils";

function PreviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PreviewTabBar() {
  return (
    <nav
      aria-label="Preview tab bar"
      className="overflow-hidden rounded-[var(--radius-list)] border border-border bg-[var(--tab-bar-bg)]"
    >
      <div className="flex items-end px-1 pb-2 pt-3">
        <button
          type="button"
          className="relative flex min-h-11 flex-1 flex-col items-center justify-end gap-0.5 pb-2 pt-2 text-[10px] font-medium text-[var(--tab-active-fg,var(--primary))]"
        >
          <span className="relative flex flex-col items-center gap-0.5 rounded-[var(--tab-active-radius)] bg-[var(--tab-active-bg)] px-[var(--tab-active-padding-x)] py-0.5">
            <LayoutDashboard className="size-[18px] scale-105" />
          </span>
          <span>Home</span>
        </button>
        <button
          type="button"
          className="relative flex min-h-11 flex-1 flex-col items-center justify-end gap-0.5 pb-2 pt-2 text-[10px] font-medium text-muted-foreground"
        >
          <span className="relative flex flex-col items-center gap-0.5 rounded-[var(--tab-active-radius)] px-[var(--tab-active-padding-x)] py-0.5">
            <ScanSearch className="size-[18px]" />
          </span>
          <span>Review</span>
        </button>
        <button type="button" className="relative flex flex-[1.15] flex-col items-center justify-end pb-1.5 pt-0">
          <span
            className="flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background size-[var(--record-fab-size)] -mt-5 shadow-[var(--record-fab-shadow)]"
          >
            <Plus className="size-7 stroke-[2.5]" />
          </span>
          <span className="mt-1 text-[10px] font-semibold text-primary">Record</span>
        </button>
        <button
          type="button"
          className="relative flex min-h-11 flex-1 flex-col items-center justify-end gap-0.5 pb-2 pt-2 text-[10px] font-medium text-muted-foreground"
        >
          <span className="relative flex flex-col items-center gap-0.5 rounded-[var(--tab-active-radius)] px-[var(--tab-active-padding-x)] py-0.5">
            <Building2 className="size-[18px]" />
          </span>
          <span>Banking</span>
        </button>
        <button
          type="button"
          className="relative flex min-h-11 flex-1 flex-col items-center justify-end gap-0.5 pb-2 pt-2 text-[10px] font-medium text-muted-foreground"
        >
          <span className="relative flex flex-col items-center gap-0.5 rounded-[var(--tab-active-radius)] px-[var(--tab-active-padding-x)] py-0.5">
            <Menu className="size-[18px]" />
          </span>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}

export function ThemePreviewGallery({ className }: { className?: string }) {
  const [period, setPeriod] = useState<PeriodPreset>("month");
  const [voidOpen, setVoidOpen] = useState(false);
  const expenseAction = RECORD_ACTIONS.find((a) => a.id === "expense")!;

  return (
    <div
      {...themeV2Props()}
      className={cn("theme-v2-gallery space-y-8 pb-8", className)}
    >
      <header className="space-y-1 border-b border-border pb-4">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">
          Preview only — not live
        </p>
        <h1 className="text-xl font-semibold">Mobile visual refresh v2</h1>
        <p className="text-sm text-muted-foreground">
          Token-driven components with sample Turkish figures. Approve before rollout.
        </p>
      </header>

      <PreviewSection title="Period chips">
        <PeriodSegmentedChips value={period} onChange={setPeriod} />
      </PreviewSection>

      <PreviewSection title="Right-now meaning chips">
        <div className="flex flex-wrap gap-2">
          <MeaningChip tone="in">Cash in</MeaningChip>
          <MeaningChip tone="out">Cash out</MeaningChip>
          <MeaningChip tone="attention">Needs review</MeaningChip>
          <MeaningChip tone="neutral">Card clearing</MeaningChip>
        </div>
      </PreviewSection>

      <PreviewSection title="Home KPI grid">
        <div className="grid gap-3 sm:grid-cols-2">
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
      </PreviewSection>

      <PreviewSection title="Sales list rows">
        <MobileCardList>
          <MobileCardRow
            title="05.08.2026"
            amount={formatTry(2_000_00)}
            leadingIcon={{ icon: Banknote, tone: "in" }}
            meta={
              <>
                <StatusBadge status="posted" />
                <EditedBadge />
              </>
            }
          />
          <MobileCardRow
            title="04.08.2026"
            amount={formatTry(1_750_00)}
            leadingIcon={{ icon: ArrowUpRight, tone: "neutral" }}
            meta={<StatusBadge status="needs_review" />}
          />
        </MobileCardList>
      </PreviewSection>

      <PreviewSection title="Balance stickers">
        <div className="space-y-3">
          <EntityBalanceSticker
            label={supplierBalanceHeading(45_000_00)}
            caption="Current balance"
            signedBalanceMinor={45_000_00}
          />
          <EntityBalanceSticker
            label={supplierBalanceHeading(-12_500_00)}
            caption="Current balance"
            signedBalanceMinor={-12_500_00}
          />
          <EntityBalanceSticker
            label={supplierBalanceHeading(0)}
            caption="Current balance"
            signedBalanceMinor={0}
          />
          <EntityBalanceSticker
            label="Owed in USD"
            caption="FX wallet"
            signedBalanceMinor={324_000}
            format={(minor) => formatFxNative(minor, "USD")}
          />
          <p className="pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Supplier detail
          </p>
          <EntityBalanceSticker
            label={supplierBalanceHeading(1_195_278_24)}
            caption="Current balance"
            signedBalanceMinor={1_195_278_24}
            details={<p>14 posted invoices</p>}
          />
          <p className="pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Customer detail
          </p>
          <EntityBalanceSticker
            label={customerBalanceHeading(320_000)}
            caption="Current balance"
            signedBalanceMinor={customerBalanceStickerMinor(320_000)}
            details={<p>Owed: {formatFxNative(124_000, "USD")}</p>}
          />
        </div>
      </PreviewSection>

      <PreviewSection title="Settings hub">
        <MobileSettingsHub />
      </PreviewSection>

      <PreviewSection title="Record desk pills">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <DeskModeButton
            action={expenseAction}
            label="Expense"
            active
            mobilePill
            onSelect={() => undefined}
          />
          <DeskModeButton
            action={RECORD_ACTIONS.find((a) => a.id === "sales")!}
            label="Daily sales"
            active={false}
            mobilePill
            onSelect={() => undefined}
          />
        </div>
      </PreviewSection>

      <PreviewSection title="Void confirm sheet">
        <button
          type="button"
          className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium"
          onClick={() => setVoidOpen(true)}
        >
          Open void confirm sample
        </button>
        <VoidConfirmDialog
          open={voidOpen}
          detail="05.08.2026 · Daily sales · 2.000,00 ₺"
          onClose={() => setVoidOpen(false)}
          onConfirm={() => setVoidOpen(false)}
        />
      </PreviewSection>

      <PreviewSection title="Group sale form footer">
        <div className="rounded-[var(--radius-card)] bg-muted/50 p-3 text-sm">
          <p>
            Booking total:{" "}
            <span className="font-medium tabular-nums">€ 1.240,00</span>
            <span className="text-muted-foreground">
              {" "}
              · ≈ 45.680,00 ₺ at 36,84
            </span>
          </p>
        </div>
      </PreviewSection>

      <PreviewSection title="Bottom tab bar">
        <PreviewTabBar />
      </PreviewSection>
    </div>
  );
}
