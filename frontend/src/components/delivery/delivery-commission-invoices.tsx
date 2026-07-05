"use client";

import { useMemo, useState } from "react";

import { InvoiceDraftReview } from "@/components/invoice-draft-review";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { currentMonthRange } from "@/lib/date-range";
import {
  invoiceCounterpartyLabel,
  postedCommissionInvoicesListPath,
  postedInvoicesEmptyHint,
  type InvoiceDraftListRow,
} from "@/lib/invoice-draft-list";
import { formatTrDate, formatTry } from "@/lib/money";
import { useEntityList } from "@/lib/use-entity-list";

type Props = {
  entityId: string;
  platformId: string;
  platformName: string;
};

export function DeliveryCommissionInvoices({
  entityId,
  platformId,
  platformName,
}: Props) {
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const range = currentMonthRange();
  const listPath = useMemo(
    () =>
      `${postedCommissionInvoicesListPath(range.from, range.to)}&delivery_platform_id=${encodeURIComponent(platformId)}`,
    [platformId, range.from, range.to],
  );
  const { items, loading, error } = useEntityList<InvoiceDraftListRow>(
    listPath,
    entityId,
  );

  if (loading) {
    return <TableSkeleton columns={5} />;
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {postedInvoicesEmptyHint(true)} No posted commission e-Faturas for{" "}
        {platformName} this month.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Commission invoices
      </h3>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Date</DataTableHeaderCell>
            <DataTableHeaderCell>Invoice</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
            <DataTableHeaderCell>Status</DataTableHeaderCell>
            <DataTableHeaderCell> </DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {items.map((row) => (
            <DataTableRow key={row.id}>
              <DataTableCell>{formatTrDate(row.invoice_date)}</DataTableCell>
              <DataTableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{row.invoice_number}</span>
                  <span className="text-xs text-muted-foreground">
                    {invoiceCounterpartyLabel(row)}
                  </span>
                </div>
              </DataTableCell>
              <DataTableCell align="right">
                {formatTry(row.gross_kurus)}
              </DataTableCell>
              <DataTableCell>
                <StatusBadge status={row.status} />
              </DataTableCell>
              <DataTableCell>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 px-2 text-xs"
                  onClick={() =>
                    setExpandedDraftId((current) =>
                      current === row.id ? null : row.id,
                    )
                  }
                >
                  {expandedDraftId === row.id ? "Hide" : "View"}
                </Button>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {expandedDraftId && (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <InvoiceDraftReview
            key={expandedDraftId}
            draftId={expandedDraftId}
            embedded
            readOnly
          />
        </div>
      )}
    </div>
  );
}