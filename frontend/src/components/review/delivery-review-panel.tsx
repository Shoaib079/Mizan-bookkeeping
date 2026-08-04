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
import { ListPage } from "@/components/page/list-page";
import { EmptyState } from "@/components/ui/empty-state";
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
    <ListPage
      title="Delivery to review"
      meta="Confirm platform sales before posting."
      loading={loading}
      error={error}
      countLabel={
        pending.length > 0 ? `${pending.length} awaiting review` : undefined
      }
      skeletonColumns={5}
      isEmpty={pending.length === 0}
      empty={
        <EmptyState
          icon={Truck}
          title="Nothing to review"
          hint="Platform sales awaiting review will appear here."
        />
      }
      table={
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
      }
    />
  );
}
