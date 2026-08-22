"use client";

/** Interactive phone walkthrough for mobile visual refresh v2 — preview route only. */

import { useState } from "react";

import { VoidConfirmDialog } from "@/components/ledger/void-confirm-dialog";
import {
  PreviewBalancesScreen,
  PreviewCustomerDetailScreen,
  PreviewSupplierDetailScreen,
} from "@/components/preview/preview-balances-screen";
import { PreviewHomeScreen } from "@/components/preview/preview-home-screen";
import { PreviewMoreScreen } from "@/components/preview/preview-more-screen";
import { PreviewRecordScreen } from "@/components/preview/preview-record-screen";
import {
  PreviewSaleDetailScreen,
  PreviewSalesScreen,
} from "@/components/preview/preview-sales-screen";
import { PREVIEW_VOID_DETAIL } from "@/components/preview/preview-sample-data";
import { PreviewTabBar } from "@/components/preview/preview-tab-bar";
import type { PeriodPreset } from "@/components/ui/period-segmented-chips";
import {
  selectPreviewTab,
  type PreviewStack,
  type PreviewTab,
} from "@/lib/preview-nav";
import { themeV2Props } from "@/lib/theme-v2";
import { cn } from "@/lib/utils";

export function ThemePreviewGallery({ className }: { className?: string }) {
  const [tab, setTab] = useState<PreviewTab>("home");
  const [stack, setStack] = useState<PreviewStack>({ kind: "root" });
  const [period, setPeriod] = useState<PeriodPreset>("month");
  const [salesFilter, setSalesFilter] = useState<"all" | "posted" | "corrected">(
    "all",
  );
  const [salesSearch, setSalesSearch] = useState("");
  const [voidOpen, setVoidOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  function showPreviewOnly(label: string) {
    setHint(`${label} — preview only`);
  }

  function switchTab(next: PreviewTab) {
    selectPreviewTab(next, setTab);
    setStack({ kind: "root" });
    setHint(null);
  }

  function renderRoot() {
    switch (tab) {
      case "home":
        return (
          <PreviewHomeScreen
            period={period}
            onPeriodChange={setPeriod}
            onPreviewOnly={showPreviewOnly}
          />
        );
      case "sales":
        return (
          <PreviewSalesScreen
            filter={salesFilter}
            onFilterChange={setSalesFilter}
            search={salesSearch}
            onSearchChange={setSalesSearch}
            onOpenSale={(saleId) => setStack({ kind: "sale-detail", saleId })}
          />
        );
      case "balances":
        return (
          <PreviewBalancesScreen
            onOpenSupplier={() => setStack({ kind: "supplier-detail" })}
            onOpenCustomer={() => setStack({ kind: "customer-detail" })}
          />
        );
      case "record":
        return <PreviewRecordScreen onPreviewOnly={showPreviewOnly} />;
      case "more":
        return <PreviewMoreScreen onPreviewOnly={showPreviewOnly} />;
    }
  }

  function renderStack() {
    if (stack.kind === "sale-detail") {
      return (
        <PreviewSaleDetailScreen
          saleId={stack.saleId}
          onBack={() => setStack({ kind: "root" })}
        />
      );
    }
    if (stack.kind === "supplier-detail") {
      return (
        <PreviewSupplierDetailScreen
          onBack={() => setStack({ kind: "root" })}
          onVoid={() => setVoidOpen(true)}
        />
      );
    }
    if (stack.kind === "customer-detail") {
      return (
        <PreviewCustomerDetailScreen onBack={() => setStack({ kind: "root" })} />
      );
    }
    return renderRoot();
  }

  return (
    <div
      {...themeV2Props()}
      className={cn(
        "theme-v2-gallery flex min-h-[70vh] flex-col",
        className,
      )}
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-4">
        {renderStack()}
        {hint ? (
          <p
            role="status"
            className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-foreground"
          >
            {hint}
          </p>
        ) : null}
      </div>

      <PreviewTabBar active={tab} onSelect={switchTab} />

      <VoidConfirmDialog
        open={voidOpen}
        detail={PREVIEW_VOID_DETAIL}
        onClose={() => setVoidOpen(false)}
        onConfirm={() => {
          setVoidOpen(false);
          setHint("Void — preview only");
        }}
      />
    </div>
  );
}
