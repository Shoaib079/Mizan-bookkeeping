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
import { ListPage } from "@/components/page/list-page";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { Users } from "lucide-react";
import Link from "next/link";
import { useEntity } from "@/lib/entity-context";
import { formatFxNative } from "@/lib/fx-money";
import type { GroupSaleRead } from "@/lib/group-sales-types";
import { formatTrDate, formatTry } from "@/lib/money";
import { useEntityList } from "@/lib/use-entity-list";
import { VoidTriggerButton } from "@/components/ledger/void-trigger-button";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { entityPath } from "@/lib/api";
import { formatVoidConfirmDetail } from "@/lib/void-confirm-summary";

/** A group sale is posted, voided or amended — nothing else.
 *
 * This used to translate posted → "active" and voided → "inactive", then let
 * anything unrecognised fall through to "pending". Amended was unrecognised,
 * so a sale you had corrected was labelled as though it were waiting for
 * something. It is not waiting; it has been replaced, and nothing in this app
 * is ever pending.
 *
 * Only "posted" is translated now, because a group sale being live reads
 * better as Active than as Posted. The other two go to StatusBadge as they
 * are, so they get that component's wording and its struck-through styling —
 * and a status added to the backend later shows up rather than being
 * quietly relabelled.
 */
function statusBadge(status: string): string {
  return status === "posted" ? "active" : status;
}

function formatSaleTotal(sale: GroupSaleRead): string {
  if (sale.forex_currency && sale.total_forex_minor != null) {
    return `${formatFxNative(sale.total_forex_minor, sale.forex_currency)} (${formatTry(sale.total_kurus)})`;
  }
  return formatTry(sale.total_kurus);
}

export default function GroupSalesPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error, reload, offset, setOffset, pageSize } = useEntityList<GroupSaleRead>(
    "/group-sales",
    entityId,
  );
  const { items: customers } = useEntityList<{ id: string; name: string }>(
    "/customers",
    entityId,
  );
  const agencyNameById = new Map(customers.map((c) => [c.id, c.name]));
  const [formOpen, setFormOpen] = useState(false);
  const [editSale, setEditSale] = useState<GroupSaleRead | null>(null);
  const [voidSale, setVoidSale] = useState<GroupSaleRead | null>(null);

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  return (
    <ListPage
      title="Group sale records"
      hideTitleOnDesktop
      loading={loading}
      error={error}
      primaryAction={
        <Button type="button" onClick={() => setFormOpen(true)}>
          New group sale
        </Button>
      }
      countLabel={`${total} group sale${total === 1 ? "" : "s"}`}
      skeletonColumns={6}
      isEmpty={items.length === 0}
      empty={
        <EmptyState
          icon={Users}
          title="No group sales yet"
          hint="Record a tour or agency booking with menu lines and pax."
        />
      }
      mobile={
        <MobileCardList>
          {items.map((sale) => (
            <MobileCardRow
              key={sale.id}
              href={`/customers/group-sales/${sale.id}`}
              title={agencyNameById.get(sale.customer_id) ?? "Agency"}
              amount={formatSaleTotal(sale)}
              meta={
                <>
                  <span>{formatTrDate(sale.sale_date)}</span>
                  {sale.description && (
                    <span className="truncate">{sale.description}</span>
                  )}
                  <StatusBadge status={statusBadge(sale.status)} />
                </>
              }
            />
          ))}
        </MobileCardList>
      }
      table={
        <DataTable wide>
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
                    {agencyNameById.get(sale.customer_id) ?? "Agency"}
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
                      <Button type="button" variant="ghost">
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
                            confirmDetail={formatVoidConfirmDetail({
                              date: formatTrDate(sale.sale_date),
                              type: "Group sale",
                              amount: formatSaleTotal(sale),
                              description: sale.description,
                            })}
                            onContinue={() => setVoidSale(sale)}
                          />
                        </>
                      ))}
                  </div>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      }
      pager={{ offset, pageSize, total, onOffsetChange: setOffset }}
    >
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
      <VoidSubledgerDialog
        open={voidSale !== null}
        title="Void group sale"
        description={
          voidSale
            ? formatVoidConfirmDetail({
                date: formatTrDate(voidSale.sale_date),
                type: "Group sale",
                amount: formatSaleTotal(voidSale),
                description: voidSale.description,
              })
            : null
        }
        voidPath={
          entityId && voidSale
            ? entityPath(entityId, `group-sales/${voidSale.id}/void`)
            : null
        }
        onClose={() => setVoidSale(null)}
        onSaved={() => {
          setVoidSale(null);
          void reload();
        }}
      />
    </ListPage>
  );

}
