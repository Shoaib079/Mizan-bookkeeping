"use client";

import Link from "next/link";
import { useState } from "react";

import { PosSummaryUploadForm } from "@/components/forms/pos-summary-upload-form";
import { AppShell } from "@/components/layout/app-shell";
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
import { ShoppingBag } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { useEntityList } from "@/lib/use-entity-list";
import type { PosDailySummary } from "@/lib/pos-delivery-types";

export default function SalesPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error } = useEntityList<PosDailySummary>(
    "/pos/daily-summaries",
    entityId,
  );
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <AppShell title="Daily sales">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? `${total} daily summar${total === 1 ? "y" : "ies"}`
            : "Select a restaurant in the sidebar"}
        </p>
        <Button
          type="button"
          disabled={!entityId}
          onClick={() => setUploadOpen(true)}
        >
          Upload POS photo
        </Button>
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
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <PosSummaryUploadForm
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
      />
    </AppShell>
  );
}
