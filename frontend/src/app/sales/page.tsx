"use client";

import { AppShell } from "@/components/layout/app-shell";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { useEntityList } from "@/lib/use-entity-list";

type SalesRow = {
  id: string;
  summary_date: string | null;
  cash_kurus: number;
  card_kurus: number;
  total_kurus: number;
  status: string;
  review_reason: string | null;
};

export default function SalesPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error } = useEntityList<SalesRow>(
    "/pos/daily-summaries",
    entityId,
  );

  return (
    <AppShell title="Daily sales">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? `${total} daily summar${total === 1 ? "y" : "ies"}`
            : "Select a restaurant in the sidebar"}
        </p>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading sales…</p>
      )}

      {!loading && entityId && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No sales yet. Use <strong>New → Daily sales (manual)</strong> or
          upload a POS summary photo.
        </p>
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
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </AppShell>
  );
}
