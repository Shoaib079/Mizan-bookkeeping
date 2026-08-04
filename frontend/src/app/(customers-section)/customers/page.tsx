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
import { ListPage } from "@/components/page/list-page";
import { HeadlineFigure } from "@/components/page/summary-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
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

  const CustomerTable = () => (
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
  );

  const CustomerCards = () => (
            <MobileCardList>
              {items.map((row) => {
                const balance = balancesState.balances.get(row.id) ?? 0;
                return (
                  <MobileCardRow
                    key={row.id}
                    href={`/customers/${row.id}`}
                    title={row.name}
                    meta={
                      <>
                        <span>{row.identifier ?? "No ID"}</span>
                        <StatusBadge status={row.is_active ? "active" : "inactive"} />
                      </>
                    }
                    amount={balance === 0 ? "—" : formatTry(balance)}
                    amountClassName={cn(balance > 0 && "text-success")}
                  />
                );
              })}
            </MobileCardList>
  );

  return (
    <ListPage
      title="Customers"
      loading={loading}
      error={error}
      forbidden={
        entityId && forbidden ? (
          <ForbiddenMessage context="customer list" />
        ) : undefined
      }
      primaryAction={
        <Button
          type="button"
          disabled={!entityId}
          onClick={() => setFormOpen(true)}
        >
          New customer
        </Button>
      }
      toolbar={
        <Input
          value={searchDraft}
          disabled={!entityId}
          placeholder="Search customers…"
          className="w-56"
          onChange={(event) => setSearchDraft(event.target.value)}
        />
      }
      countLabel={
        entityId
          ? `${total} registered customer${total === 1 ? "" : "s"} (active and inactive — never deleted)`
          : "Select a restaurant in the sidebar"
      }
      summary={
        entityId && (
          <HeadlineFigure
            label="Total receivable"
            amountKurus={balancesState.totalKurus}
            caption="Across all customers."
            format={balancesState.loading ? () => "…" : undefined}
          />
        )
      }
      skeletonColumns={4}
      isEmpty={Boolean(entityId) && items.length === 0}
      empty={
        <EmptyState
          icon={UserCircle}
          title={search ? "No customers match your search" : "No customers yet"}
          hint={
            search
              ? "Try a different name or clear the search."
              : "Add customers for credit sales and payments."
          }
        />
      }
      table={<CustomerTable />}
      mobile={<CustomerCards />}
      pager={{ offset, pageSize, total, onOffsetChange: setOffset }}
    >
      <CustomerForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </ListPage>
  );

}
