"use client";

/** Customers list — directory with balances, search, and paging (audit A2/A3). */

import Link from "next/link";
import { useMemo, useState } from "react";

import { ForbiddenMessage } from "@/components/reports/forbidden-message";
import { CustomerForm, type CustomerRow } from "@/components/forms/customer-form";
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
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { TablePager } from "@/components/ui/table-pager";
import { UserCircle } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useEntityList } from "@/lib/use-entity-list";
import { useCustomerBalances } from "@/lib/use-balance-map";
import { cn } from "@/lib/utils";

export default function CustomersPage() {
  const { entityId } = useEntity();
  const [searchDraft, setSearchDraft] = useState("");
  const search = useDebouncedValue(searchDraft.trim(), 300);
  const listPath = useMemo(() => {
    const params = new URLSearchParams({ include_inactive: "true" });
    if (search) params.set("q", search);
    return `/customers?${params.toString()}`;
  }, [search]);
  const { items, total, loading, error, forbidden, reload, offset, setOffset, pageSize } =
    useEntityList<CustomerRow>(listPath, entityId);
  const balancesState = useCustomerBalances(entityId);
  const [formOpen, setFormOpen] = useState(false);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={searchDraft}
            disabled={!entityId}
            placeholder="Search customers…"
            className="w-56"
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            {entityId
              ? `${total} registered customer${total === 1 ? "" : "s"} (active and inactive — never deleted)`
              : "Select a restaurant in the sidebar"}
          </p>
        </div>
        <Button type="button" disabled={!entityId} onClick={() => setFormOpen(true)}>
          New customer
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {entityId && forbidden && <ForbiddenMessage context="customer list" />}
      {loading && <TableSkeleton columns={4} />}

      {!loading && entityId && !forbidden && items.length === 0 && (
        <EmptyState
          icon={UserCircle}
          title={search ? "No customers match your search" : "No customers yet"}
          hint={
            search
              ? "Try a different name or clear the search."
              : "Add customers for credit sales and payments."
          }
        />
      )}

      {items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Name</DataTableHeaderCell>
              <DataTableHeaderCell>Identifier</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Owed to you</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => {
              const balance = balancesState.balances.get(row.id) ?? 0;
              return (
                <DataTableRow key={row.id} href={`/customers/${row.id}`}>
                  <DataTableCell>
                    <Link
                      href={`/customers/${row.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {row.name}
                    </Link>
                  </DataTableCell>
                  <DataTableCell>{row.identifier ?? "—"}</DataTableCell>
                  <DataTableCell>
                    <StatusBadge status={row.is_active ? "active" : "inactive"} />
                  </DataTableCell>
                  <DataTableCell
                    align="right"
                    className={cn("tabular-nums", balance > 0 && "text-success")}
                  >
                    {balance === 0 ? "—" : formatTry(balance)}
                  </DataTableCell>
                </DataTableRow>
              );
            })}
          </DataTableBody>
        </DataTable>
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
          Total receivable across all customers:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {balancesState.loading ? "…" : formatTry(balancesState.totalKurus)}
          </span>
          .
        </p>
      )}

      <CustomerForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </>
  );
}
