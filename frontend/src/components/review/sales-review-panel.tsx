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
import { ShoppingBag } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import type { PosDailySummary } from "@/lib/pos-delivery-types";
import { isPendingReviewStatus } from "@/lib/review-status";
import { useEntityList } from "@/lib/use-entity-list";

export function SalesReviewPanel() {
  const { entityId } = useEntity();
  const { items, loading, error, reload } = useEntityList<PosDailySummary>(
    "/pos/daily-summaries",
    entityId,
  );
  const pending = items.filter((row) => isPendingReviewStatus(row.status));
  const posted = items.filter((row) => row.status === "posted");
  const [correctSummary, setCorrectSummary] = useState<PosDailySummary | null>(
    null,
  );

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Confirm or correct daily POS summaries. Posted summaries can be corrected
        below.
      </p>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={5} />}

      {!loading && (
        <section className="mb-8">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            Awaiting review
          </h3>
          {pending.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="Nothing to review"
              hint="Uploaded or manual sales awaiting review will appear here."
            />
          ) : (
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
                {pending.map((row) => (
                  <DataTableRow key={row.id}>
                    <DataTableCell>
                      <Link
                        href={`/sales/${row.id}`}
                        className="text-primary hover:underline"
                      >
                        {row.summary_date ? formatTrDate(row.summary_date) : "—"}
                      </Link>
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
        </section>
      )}

      {!loading && posted.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            Posted (correctable)
          </h3>
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
              {posted.map((row) => (
                <DataTableRow key={row.id}>
                  <DataTableCell>
                    {row.summary_date ? formatTrDate(row.summary_date) : "—"}
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
                  </DataTableCell>
                  <DataTableCell align="right">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      onClick={() => setCorrectSummary(row)}
                    >
                      Correct
                    </Button>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        </section>
      )}

      <CorrectDailySalesForm
        open={correctSummary !== null}
        summary={correctSummary}
        onClose={() => setCorrectSummary(null)}
        onSaved={() => void reload()}
      />
    </>
  );
}
