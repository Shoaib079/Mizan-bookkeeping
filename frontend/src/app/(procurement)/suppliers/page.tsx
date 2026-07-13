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
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { TablePager } from "@/components/ui/table-pager";
import { Users } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import { formatSupplierPayableBalance } from "@/lib/supplier-balance";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useEntityList } from "@/lib/use-entity-list";
import { useSupplierBalances } from "@/lib/use-balance-map";
import { cn } from "@/lib/utils";

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
            <DataTableRow key={row.id}>
              <DataTableCell>
                <Link
                  href={`/suppliers/${row.id}`}
                  className="text-primary hover:underline"
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

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={searchDraft}
            disabled={!entityId}
            placeholder="Search suppliers…"
            className="w-56"
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            {entityId
              ? showInactive
                ? `${activeCount} active · ${inactiveItems.length} inactive`
                : `${total} active supplier${total === 1 ? "" : "s"}`
              : "Select a restaurant in the sidebar"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
          <Button
            type="button"
            disabled={!entityId}
            onClick={() => setFormOpen(true)}
          >
            New supplier
          </Button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {entityId && forbidden && <ForbiddenMessage context="supplier list" />}
      {loading && <TableSkeleton columns={4} />}

      {!loading && entityId && !forbidden && items.length === 0 && (
        <EmptyState
          icon={Users}
          title={search ? "No suppliers match your search" : "No suppliers yet"}
          hint={
            search
              ? "Try a different name or clear the search."
              : "Create a supplier to track payables and e-Fatura invoices."
          }
        />
      )}

      {!loading && !forbidden && showInactive && activeItems.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Active suppliers
          </h2>
          <SupplierTable rows={activeItems} balances={balancesState.balances} />
        </section>
      )}

      {!loading && !forbidden && showInactive && inactiveItems.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Inactive suppliers
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Deactivated suppliers stay in history but are hidden from invoice
            linking and new payments.
          </p>
          <SupplierTable rows={inactiveItems} balances={balancesState.balances} />
        </section>
      )}

      {!loading && !forbidden && !showInactive && items.length > 0 && (
        <SupplierTable rows={items} balances={balancesState.balances} />
      )}

      {!forbidden && (
        <TablePager
          offset={offset}
          pageSize={pageSize}
          total={total}
          disabled={loading}
          onOffsetChange={setOffset}
        />
      )}

      {entityId && !forbidden && (
        <p className="mt-4 text-xs text-muted-foreground">
          Total payable across all suppliers:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {balancesState.loading ? "…" : formatTry(balancesState.totalKurus)}
          </span>
          .
        </p>
      )}

      <SupplierForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </>
  );
}
