"use client";

import Link from "next/link";

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
import { useQuickActions } from "@/components/quick-actions";
import { useEntity } from "@/lib/entity-context";
import { formatDeliveryPeriod } from "@/lib/delivery-period";
import { formatTry } from "@/lib/money";
import type { DeliveryReport } from "@/lib/pos-delivery-types";
import { isPendingReviewStatus } from "@/lib/review-status";
import { useEntityList } from "@/lib/use-entity-list";

export function DeliveryReviewPanel() {
  const { entityId } = useEntity();
  const { deliveryEnabled } = useQuickActions();
  const { items, loading, error } = useEntityList<DeliveryReport>(
    "/delivery/reports",
    entityId,
  );
  const pending = items.filter((row) => isPendingReviewStatus(row.status));

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  if (!deliveryEnabled) {
    return (
      <p className="text-sm text-muted-foreground">
        Delivery is turned off for this restaurant. Enable it under Settings →
        Restaurant & toggles.
      </p>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Confirm platform sales before posting.
      </p>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={5} />}
      {!loading && pending.length === 0 && (
        <EmptyState
          icon={Truck}
          title="Nothing to review"
          hint="Platform sales awaiting review will appear here."
        />
      )}
      {!loading && pending.length > 0 && (
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
            {pending.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>
                  <Link
                    href={`/delivery/reports?report=${row.id}`}
                    className="text-primary hover:underline"
                  >
                    {formatDeliveryPeriod(row)}
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
    </>
  );
}
