"use client";

/** Suppliers list — directory with balances, search, and paging (audit A2/A3). */

import Link from "next/link";
import { useMemo, useState } from "react";

import { SupplierForm, type SupplierRow } from "@/components/forms/supplier-form";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { ForbiddenMessage } from "@/components/reports/forbidden-message";
import { ListPage } from "@/components/page/list-page";
import { HeadlineFigure } from "@/components/page/summary-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { Users } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import { formatSupplierPayableBalance, isSupplierAdvanceBalance } from "@/lib/supplier-balance";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useEntityList } from "@/lib/use-entity-list";
import { useSupplierBalances } from "@/lib/use-balance-map";
import { cn } from "@/lib/utils";

function SupplierCardList({
  rows,
  balances,
}: {
  rows: SupplierRow[];
  balances: Map<string, number>;
}) {
  return (
    <MobileCardList>
      {rows.map((row) => {
        const balance = balances.get(row.id) ?? 0;
        const advance = isSupplierAdvanceBalance(balance);
        return (
          <MobileCardRow
            key={row.id}
            href={`/suppliers/${row.id}`}
            title={row.name}
            meta={
              <>
                <span>{row.vkn || "No VKN"}</span>
                <StatusBadge status={row.is_active ? "active" : "inactive"} />
              </>
            }
            amount={
              balance === 0
                ? "—"
                : advance
                  ? formatTry(Math.abs(balance))
                  : formatTry(balance)
            }
            amountNote={advance ? "Advance · invoice pending" : undefined}
            amountClassName={cn(
              balance > 0 && "text-destructive",
              advance && "text-success",
            )}
          />
        );
      })}
    </MobileCardList>
  );
}

function SupplierTable({
  rows,
  balances,
}: {
  rows: SupplierRow[];
  balances: Map<string, number>;
}) {
  return (
    <DataTable>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Name</DataTableHeaderCell>
          <DataTableHeaderCell>VKN</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Balance owed</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {rows.map((row) => {
          const balance = balances.get(row.id) ?? 0;
          return (
            <DataTableRow key={row.id} href={`/suppliers/${row.id}`}>
              <DataTableCell>
                <Link
                  href={`/suppliers/${row.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {row.name}
                </Link>
              </DataTableCell>
              <DataTableCell>{row.vkn}</DataTableCell>
              <DataTableCell>
                <StatusBadge status={row.is_active ? "active" : "inactive"} />
              </DataTableCell>
              <DataTableCell
                align="right"
                className={cn(
                  "tabular-nums",
                  balance > 0 && "text-destructive",
                  balance < 0 && "text-success",
                )}
              >
                {balance === 0 ? "—" : formatSupplierPayableBalance(balance)}
              </DataTableCell>
            </DataTableRow>
          );
        })}
      </DataTableBody>
    </DataTable>
  );
}

export default function SuppliersPage() {
  const { entityId } = useEntity();
  const [showInactive, setShowInactive] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const search = useDebouncedValue(searchDraft.trim(), 300);
  const listPath = useMemo(() => {
    const params = new URLSearchParams({
      include_inactive: showInactive ? "true" : "false",
    });
    if (search) params.set("q", search);
    return `/suppliers?${params.toString()}`;
  }, [showInactive, search]);
  const { items, total, loading, error, forbidden, reload, offset, setOffset, pageSize } =
    useEntityList<SupplierRow>(listPath, entityId);
  const balancesState = useSupplierBalances(entityId);
  const [formOpen, setFormOpen] = useState(false);

  const activeItems = useMemo(() => items.filter((row) => row.is_active), [items]);
  const inactiveItems = useMemo(() => items.filter((row) => !row.is_active), [items]);
  const activeCount = showInactive ? activeItems.length : total;

  const sections = (
    render: (props: { rows: SupplierRow[] }) => React.ReactNode,
  ) => {
    if (!showInactive) return render({ rows: items });
    return (
      <>
        {activeItems.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 text-sm font-semibold text-foreground">
              Active suppliers
            </h2>
            {render({ rows: activeItems })}
          </section>
        )}
        {inactiveItems.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
              Inactive suppliers
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Deactivated suppliers stay in history but are hidden from invoice
              linking and new payments.
            </p>
            {render({ rows: inactiveItems })}
          </section>
        )}
      </>
    );
  };

  return (
    <ListPage
      title="Suppliers"
      loading={loading}
      error={error}
      forbidden={
        entityId && forbidden ? (
          <ForbiddenMessage context="supplier list" />
        ) : undefined
      }
      primaryAction={
        <Button
          type="button"
          disabled={!entityId}
          onClick={() => setFormOpen(true)}
        >
          New supplier
        </Button>
      }
      toolbar={
        <>
          <Input
            value={searchDraft}
            disabled={!entityId}
            placeholder="Search suppliers…"
            className="w-56"
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          {entityId && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Show inactive suppliers
            </label>
          )}
        </>
      }
      countLabel={
        entityId
          ? showInactive
            ? `${activeCount} active · ${inactiveItems.length} inactive`
            : `${total} active supplier${total === 1 ? "" : "s"}`
          : "Select a restaurant in the sidebar"
      }
      summary={
        entityId && (
          <HeadlineFigure
            label="Total payables"
            amountKurus={balancesState.totalKurus}
            caption="Across all suppliers — any month until paid."
            format={balancesState.loading ? () => "…" : undefined}
          />
        )
      }
      skeletonColumns={4}
      isEmpty={Boolean(entityId) && items.length === 0}
      empty={
        <EmptyState
          icon={Users}
          title={search ? "No suppliers match your search" : "No suppliers yet"}
          hint={
            search
              ? "Try a different name or clear the search."
              : "Create a supplier to track payables and e-Fatura invoices."
          }
        />
      }
      table={sections((props) => (
        <SupplierTable {...props} balances={balancesState.balances} />
      ))}
      mobile={sections((props) => (
        <SupplierCardList {...props} balances={balancesState.balances} />
      ))}
      pager={{ offset, pageSize, total, onOffsetChange: setOffset }}
    >
      <SupplierForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </ListPage>
  );
}
