"use client";

import Link from "next/link";
import { useState } from "react";

import { DeliveryReportForm } from "@/components/forms/delivery-report-form";
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
import { Truck } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { useEntityList } from "@/lib/use-entity-list";
import type { DeliveryReport } from "@/lib/pos-delivery-types";

export default function DeliveryReportsPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error, reload } = useEntityList<DeliveryReport>(
    "/delivery/reports",
    entityId,
  );
  const [formOpen, setFormOpen] = useState(false);

  return (
    <AppShell title="Delivery reports">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? `${total} report${total === 1 ? "" : "s"}`
            : "Select a restaurant in the sidebar"}
        </p>
        <Button
          type="button"
          disabled={!entityId}
          onClick={() => setFormOpen(true)}
        >
          New report
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={5} />}

      {!loading && entityId && items.length === 0 && (
        <EmptyState
          icon={Truck}
          title="No delivery reports yet"
          hint="Enter gross, commission, and net from the platform statement."
        />
      )}

      {items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Date</DataTableHeaderCell>
              <DataTableHeaderCell>Platform</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Gross</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Net</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>
                  <Link
                    href={`/delivery/reports/${row.id}`}
                    className="text-primary hover:underline"
                  >
                    {formatTrDate(row.report_date)}
                  </Link>
                </DataTableCell>
                <DataTableCell>{row.platform_name}</DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.gross_kurus)}
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.net_kurus)}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge status={row.status} />
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <DeliveryReportForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </AppShell>
  );
}
