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
import { EntityBalanceSticker } from "@/components/entity-balance-sticker";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { UserCircle } from "lucide-react";
import { DirectoryBalanceCell } from "@/components/directory-balance-cell";
import { useWriteChrome } from "@/lib/use-write-chrome";
import { useEntity } from "@/lib/entity-context";
import { formatForexBalanceSummary } from "@/lib/fx-money";
import { formatTry } from "@/lib/money";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useEntityList } from "@/lib/use-entity-list";
import { useCustomerBalances } from "@/lib/use-balance-map";
import {
  customerBalanceStickerMinor,
  customerDirectoryBalanceLabel,
} from "@/lib/customer-balance";

export default function CustomersPage() {
  const { entityId } = useEntity();
  const { showWrite } = useWriteChrome();
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
                <DataTableHeaderCell align="right">Balance</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {items.map((row) => {
                const balance = balancesState.balances.get(row.id) ?? 0;
                const forexSummary = formatForexBalanceSummary(
                  balancesState.forex.get(row.id),
                );
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
                    {/* The lira figure is the ledger's truth, so it stays the
                        headline. Direction words come from the shared helper
                        (same sign rule as detail stickers). The agreed currency
                        sits under it — what the customer will actually hand over. */}
                    <DataTableCell align="right">
                      <DirectoryBalanceCell
                        balanceMinor={balance}
                        party="customer"
                        formatAbs={(abs) => formatTry(abs)}
                      />
                      {forexSummary && (
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          {forexSummary}
                        </span>
                      )}
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
                const forexSummary = formatForexBalanceSummary(
                  balancesState.forex.get(row.id),
                );
                return (
                  <MobileCardRow
                    key={row.id}
                    href={`/customers/${row.id}`}
                    title={row.name}
                    meta={
                      <>
                        <span>{row.identifier ?? "No ID"}</span>
                        <StatusBadge status={row.is_active ? "active" : "inactive"} />
                        {/* On a phone the amount column is narrow, so the
                            agreed currency goes in the meta row rather than
                            wrapping under a number. */}
                        {forexSummary && <span>{forexSummary}</span>}
                      </>
                    }
                    amount={
                      <DirectoryBalanceCell
                        balanceMinor={balance}
                        party="customer"
                        formatAbs={(abs) => formatTry(abs)}
                      />
                    }
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
        showWrite ? (
          <Button
            type="button"
            disabled={!entityId}
            onClick={() => setFormOpen(true)}
          >
            New customer
          </Button>
        ) : undefined
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
          <EntityBalanceSticker
            label={customerDirectoryBalanceLabel(balancesState.totalKurus)}
            caption="Across all customers."
            signedBalanceMinor={customerBalanceStickerMinor(
              balancesState.totalKurus,
            )}
            format={balancesState.loading ? () => "…" : formatTry}
            className="sm:ml-0 sm:max-w-none"
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
