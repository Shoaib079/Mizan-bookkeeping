"use client";

import Link from "next/link";
import { useState } from "react";

import { DeliveryReportForm } from "@/components/forms/delivery-report-form";
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
import { formatTry } from "@/lib/money";
import { useEntityList } from "@/lib/use-entity-list";
import type { DeliveryReport } from "@/lib/pos-delivery-types";

const MONTH_NAMES = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export default function DeliveryReportsPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error, reload } = useEntityList<DeliveryReport>(
    "/delivery/reports",
    entityId,
  );
  const [formOpen, setFormOpen] = useState(false);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? `${total} entr${total === 1 ? "y" : "ies"}`
            : "Select a restaurant in the sidebar"}
        </p>
        <Button
          type="button"
          disabled={!entityId}
          onClick={() => setFormOpen(true)}
        >
          Monthly sales
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={4} />}

      {!loading && entityId && items.length === 0 && (
        <EmptyState
          icon={Truck}
          title="No monthly sales yet"
          hint="Enter total platform sales (KDV dahil) for each month."
        />
      )}

      {items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Period</DataTableHeaderCell>
              <DataTableHeaderCell>Platform</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Gross</DataTableHeaderCell>
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
                    {MONTH_NAMES[row.period_month] ?? row.period_month}{" "}
                    {row.period_year}
                  </Link>
                </DataTableCell>
                <DataTableCell>{row.platform_name}</DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.gross_kurus)}
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
    </>
  );
}
