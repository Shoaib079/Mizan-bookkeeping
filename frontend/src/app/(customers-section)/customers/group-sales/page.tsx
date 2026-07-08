"use client";

import { useState } from "react";

import { GroupSaleForm } from "@/components/forms/group-sale-form";
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
import { Users } from "lucide-react";
import Link from "next/link";
import { useEntity } from "@/lib/entity-context";
import { formatFxNative } from "@/lib/fx-money";
import type { GroupSaleRead } from "@/lib/group-sales-types";
import { formatTrDate, formatTry } from "@/lib/money";
import { useEntityList } from "@/lib/use-entity-list";
import { VoidTriggerButton } from "@/components/ledger/void-trigger-button";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";

function statusBadge(status: string) {
  if (status === "posted") return "active" as const;
  if (status === "voided") return "inactive" as const;
  return "pending" as const;
}

function formatSaleTotal(sale: GroupSaleRead): string {
  if (sale.forex_currency && sale.total_forex_minor != null) {
    return `${formatFxNative(sale.total_forex_minor, sale.forex_currency)} (${formatTry(sale.total_kurus)})`;
  }
  return formatTry(sale.total_kurus);
}

export default function GroupSalesPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error, reload } = useEntityList<GroupSaleRead>(
    "/group-sales",
    entityId,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editSale, setEditSale] = useState<GroupSaleRead | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const { toast } = useToast();

  async function onVoid(sale: GroupSaleRead) {
    if (!entityId) return;
    setVoidingId(sale.id);
    try {
      await apiFetch(`/entities/${entityId}/group-sales/${sale.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      toast("Group sale voided");
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Void failed", "error");
    } finally {
      setVoidingId(null);
    }
  }

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {`${total} group sale${total === 1 ? "" : "s"}`}
        </p>
        <Button type="button" onClick={() => setFormOpen(true)}>
          New group sale
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={6} />}

      {!loading && items.length === 0 && (
        <EmptyState
          icon={Users}
          title="No group sales yet"
          hint="Record a tour or agency booking with menu lines and pax."
        />
      )}

      {items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Date</DataTableHeaderCell>
              <DataTableHeaderCell>Agency</DataTableHeaderCell>
              <DataTableHeaderCell>Description</DataTableHeaderCell>
              <DataTableHeaderCell>Total</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell align="right"> </DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((sale) => (
              <DataTableRow key={sale.id}>
                <DataTableCell>{formatTrDate(sale.sale_date)}</DataTableCell>
                <DataTableCell>
                  <Link
                    href={`/customers/${sale.customer_id}`}
                    className="text-primary hover:underline"
                  >
                    View agency
                  </Link>
                </DataTableCell>
                <DataTableCell>{sale.description}</DataTableCell>
                <DataTableCell className="tabular-nums">
                  {formatSaleTotal(sale)}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge status={statusBadge(sale.status)} />
                </DataTableCell>
                <DataTableCell align="right">
                  <div className="flex justify-end gap-2">
                    <Link href={`/customers/group-sales/${sale.id}`}>
                      <Button type="button" variant="secondary">
                        Open
                      </Button>
                    </Link>
                    {sale.status === "posted" &&
                      ((sale.remaining_kurus ?? sale.total_kurus) <
                      sale.total_kurus ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled
                          title="Void or settle the linked payment first"
                        >
                          Void
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setEditSale(sale)}
                          >
                            Edit
                          </Button>
                          <VoidTriggerButton
                            className="h-9 border border-destructive/40 px-3 hover:bg-destructive/10"
                            confirmTitle="Void this group sale?"
                            confirmDetail={`${sale.description} · ${formatTry(sale.total_kurus)}`}
                            confirmLabel="Void group sale"
                            confirming={voidingId === sale.id}
                            onContinue={() => void onVoid(sale)}
                          />
                        </>
                      ))}
                  </div>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <GroupSaleForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
      <GroupSaleForm
        open={editSale !== null}
        customerId={editSale?.customer_id}
        correcting={editSale ?? undefined}
        onClose={() => setEditSale(null)}
        onSaved={() => void reload()}
      />
    </>
  );
}
