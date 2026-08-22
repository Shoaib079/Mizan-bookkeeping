"use client";

import { ArrowUpRight, Banknote, ChevronLeft } from "lucide-react";

import { EditedBadge } from "@/components/ledger/corrected-badge";
import { FilterChips } from "@/components/page/filter-chips";
import {
  PREVIEW_SALES,
} from "@/components/preview/preview-sample-data";
import {
  MobileCardList,
  MobileCardRow,
} from "@/components/ui/mobile-card-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatTry } from "@/lib/money";

type SalesFilter = "all" | "posted" | "corrected";

export function PreviewSalesScreen({
  filter,
  onFilterChange,
  search,
  onSearchChange,
  onOpenSale,
}: {
  filter: SalesFilter;
  onFilterChange: (next: SalesFilter) => void;
  search: string;
  onSearchChange: (next: string) => void;
  onOpenSale: (saleId: string) => void;
}) {
  const rows = PREVIEW_SALES.filter((row) => {
    if (filter === "posted" && row.status !== "posted") return false;
    if (filter === "corrected" && !row.corrected) return false;
    if (search.trim()) {
      return row.date.includes(search.trim()) || row.detail.toLowerCase().includes(search.trim().toLowerCase());
    }
    return true;
  });

  return (
    <div className="space-y-4" data-preview-screen="sales">
      <h1 className="text-lg font-semibold">Sales</h1>
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search dates…"
        aria-label="Search sales"
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
      />
      <FilterChips
        chips={[
          { id: "all", label: "All" },
          { id: "posted", label: "Posted" },
          { id: "corrected", label: "Corrected" },
        ]}
        value={filter}
        onChange={onFilterChange}
      />
      <MobileCardList>
        {rows.map((row) => (
          <MobileCardRow
            key={row.id}
            title={row.date}
            amount={formatTry(row.amountKurus)}
            leadingIcon={{
              icon: row.tone === "in" ? Banknote : ArrowUpRight,
              tone: row.tone,
            }}
            meta={
              <>
                <StatusBadge status={row.status} />
                {row.corrected ? <EditedBadge /> : null}
              </>
            }
            onClick={() => onOpenSale(row.id)}
          />
        ))}
      </MobileCardList>
    </div>
  );
}

export function PreviewSaleDetailScreen({
  saleId,
  onBack,
}: {
  saleId: string;
  onBack: () => void;
}) {
  const sale = PREVIEW_SALES.find((row) => row.id === saleId) ?? PREVIEW_SALES[0];
  return (
    <div className="space-y-4" data-preview-screen="sale-detail">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary"
        onClick={onBack}
      >
        <ChevronLeft className="size-4" />
        Back
      </button>
      <h1 className="text-lg font-semibold">Daily sales · {sale.date}</h1>
      <p className="text-2xl font-semibold tabular-nums">{formatTry(sale.amountKurus)}</p>
      <p className="text-sm text-muted-foreground">{sale.detail}</p>
      <div className="flex flex-wrap gap-2">
        <StatusBadge status={sale.status} />
        {sale.corrected ? <EditedBadge /> : null}
      </div>
    </div>
  );
}
