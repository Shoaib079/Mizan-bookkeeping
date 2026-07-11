"use client";

import Link from "next/link";
import { useState } from "react";

import { CorrectDailySalesForm } from "@/components/forms/correct-daily-sales-form";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { TablePager } from "@/components/ui/table-pager";
import { ShoppingBag } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { useEntityList } from "@/lib/use-entity-list";
import type { PosDailySummary } from "@/lib/pos-delivery-types";

export default function SalesPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error, reload, offset, setOffset, pageSize } =
    useEntityList<PosDailySummary>("/pos/daily-summaries", entityId);
  const [correctSummary, setCorrectSummary] = useState<PosDailySummary | null>(
    null,
  );

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? `${total} daily summar${total === 1 ? "y" : "ies"}`
            : "Select a restaurant in the sidebar"}
        </p>
        <Link
          href="/record"
          className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          aria-disabled={!entityId}
          tabIndex={entityId ? 0 : -1}
        >
          Upload via Record
        </Link>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={5} />}

      {!loading && entityId && items.length === 0 && (
        <EmptyState
          icon={ShoppingBag}
          title="No sales yet"
          hint="Use New → Daily sales (manual) or upload a POS summary photo."
        />
      )}

      {items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Date</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Cash</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Card</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Total</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>
                  {(row.status === "draft" ||
                    row.status === "needs_review") &&
                  row.summary_date ? (
                    <Link
                      href={`/sales/${row.id}`}
                      className="text-primary hover:underline"
                    >
                      {formatTrDate(row.summary_date)}
                    </Link>
                  ) : row.summary_date ? (
                    formatTrDate(row.summary_date)
                  ) : (
                    "—"
                  )}
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.cash_kurus)}
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.card_kurus)}
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.total_kurus)}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge status={row.status} />
                  {row.review_reason && row.status === "needs_review" && (
                    <p className="mt-1 max-w-xs truncate text-xs text-warning">
                      {row.review_reason}
                    </p>
                  )}
                </DataTableCell>
                <DataTableCell align="right">
                  {row.status === "posted" && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      onClick={() => setCorrectSummary(row)}
                    >
                      Correct
                    </Button>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <TablePager
        offset={offset}
        pageSize={pageSize}
        total={total}
        disabled={loading}
        onOffsetChange={setOffset}
      />

      <CorrectDailySalesForm
        open={correctSummary !== null}
        summary={correctSummary}
        onClose={() => setCorrectSummary(null)}
        onSaved={() => void reload()}
      />
    </>
  );
}
