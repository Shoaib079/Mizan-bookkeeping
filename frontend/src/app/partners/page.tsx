"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { PartnerForm, type PartnerRow } from "@/components/forms/partner-form";
import { PartnerProfitAllocationForm } from "@/components/forms/partner-profit-allocation-form";
import { AppShell } from "@/components/layout/app-shell";
import { ListPage } from "@/components/page/list-page";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { Handshake } from "lucide-react";
import { ApiError, apiFetch } from "@/lib/api";
import {
  countInactiveDirectoryRows,
  directoryInactiveSplitIndex,
  sortDirectoryActiveFirst,
} from "@/lib/directory-list";
import { DirectoryBalanceCell } from "@/components/directory-balance-cell";
import { useWriteChrome } from "@/lib/use-write-chrome";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import { extractPartnerBalanceKurus } from "@/lib/partner-balance";
import { useLedgerBalanceMap } from "@/lib/use-ledger-balance-map";

type PartnerListResponse = {
  items: PartnerRow[];
  total: number;
  ownership_share?: {
    total_pct: string | null;
    partners_with_share: number;
    warning: string | null;
  };
};

function formatSharePct(value: string | null): string {
  if (value == null || value === "") return "—";
  return `${value}%`;
}

function PartnerCardList({
  items,
  balances,
  balancesLoading,
  inactiveSplitAt,
}: {
  items: PartnerRow[];
  balances: Map<string, number>;
  balancesLoading: boolean;
  inactiveSplitAt?: number;
}) {
  return (
    <MobileCardList>
      {items.map((row, index) => (
        <Fragment key={row.id}>
          {inactiveSplitAt !== undefined && index === inactiveSplitAt && (
            <p className="mb-2 mt-4 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Inactive partners
            </p>
          )}
          <MobileCardRow
            href={`/partners/${row.id}`}
            title={row.name}
            meta={
              <>
                <span>Share {formatSharePct(row.ownership_share_pct)}</span>
                <StatusBadge status={row.is_active ? "active" : "inactive"} />
              </>
            }
            amount={
              <DirectoryBalanceCell
                balanceMinor={
                  balances.has(row.id) ? balances.get(row.id) : undefined
                }
                party="partner"
                loading={balancesLoading && !balances.has(row.id)}
                formatAbs={(abs) => formatTry(abs)}
              />
            }
          />
        </Fragment>
      ))}
    </MobileCardList>
  );
}

function PartnerTable({
  items,
  balances,
  balancesLoading,
  inactiveSplitAt,
}: {
  items: PartnerRow[];
  balances: Map<string, number>;
  balancesLoading: boolean;
  inactiveSplitAt?: number;
}) {
  return (
    <DataTable>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Name</DataTableHeaderCell>
          <DataTableHeaderCell>Share %</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Balance</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {items.map((row, index) => (
          <Fragment key={row.id}>
            {inactiveSplitAt !== undefined && index === inactiveSplitAt && (
              <DataTableRow className="bg-muted/30 hover:bg-muted/30">
                <DataTableCell
                  colSpan={4}
                  className="py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Inactive partners
                </DataTableCell>
              </DataTableRow>
            )}
            <DataTableRow href={`/partners/${row.id}`}>
              <DataTableCell>
                <Link
                  href={`/partners/${row.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {row.name}
                </Link>
              </DataTableCell>
              <DataTableCell>
                {formatSharePct(row.ownership_share_pct)}
              </DataTableCell>
              <DataTableCell>
                <StatusBadge status={row.is_active ? "active" : "inactive"} />
              </DataTableCell>
              <DataTableCell align="right">
                <DirectoryBalanceCell
                  balanceMinor={
                    balances.has(row.id) ? balances.get(row.id) : undefined
                  }
                  party="partner"
                  loading={balancesLoading && !balances.has(row.id)}
                  formatAbs={(abs) => formatTry(abs)}
                />
              </DataTableCell>
            </DataTableRow>
          </Fragment>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

export default function PartnersPage() {
  const { entityId } = useEntity();
  const { showWrite } = useWriteChrome();
  const [showInactive, setShowInactive] = useState(false);
  const [items, setItems] = useState<PartnerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [shareWarning, setShareWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [balanceRefresh, setBalanceRefresh] = useState(0);

  const displayRows = useMemo(() => sortDirectoryActiveFirst(items), [items]);
  const inactiveSplitAt = useMemo(
    () => (showInactive ? directoryInactiveSplitIndex(displayRows) : undefined),
    [displayRows, showInactive],
  );
  const inactiveCount = useMemo(
    () => countInactiveDirectoryRows(displayRows),
    [displayRows],
  );
  const activeCount = showInactive ? displayRows.length - inactiveCount : total;

  const partnerIds = useMemo(() => displayRows.map((row) => row.id), [displayRows]);
  const { balances, loading: balancesLoading } = useLedgerBalanceMap(
    entityId,
    partnerIds,
    (id) => `/partners/${id}/ledger`,
    (res) => extractPartnerBalanceKurus(res),
    balanceRefresh,
  );

  const reload = useCallback(async () => {
    if (!entityId) {
      setItems([]);
      setTotal(0);
      setShareWarning(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<PartnerListResponse>(
        `/entities/${entityId}/partners?include_inactive=${showInactive ? "true" : "false"}&limit=50`,
      );
      setItems(res.items);
      setTotal(res.total);
      setShareWarning(res.ownership_share?.warning ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("You do not have access to partners for this restaurant.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
      setItems([]);
      setTotal(0);
      setShareWarning(null);
    } finally {
      setLoading(false);
    }
  }, [entityId, showInactive]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const listProps = {
    items: displayRows,
    balances,
    balancesLoading,
    inactiveSplitAt,
  };

  return (
    <AppShell title="Partners">
      <ListPage
        title="Partners"
        loading={loading}
        error={error}
        primaryAction={
          showWrite ? (
            <Button
              type="button"
              disabled={!entityId}
              onClick={() => setFormOpen(true)}
            >
              New partner
            </Button>
          ) : undefined
        }
        actions={
          showWrite ? (
            <Button
              type="button"
              variant="secondary"
              disabled={!entityId}
              onClick={() => setAllocateOpen(true)}
            >
              Allocate profit
            </Button>
          ) : undefined
        }
        toolbar={
          entityId && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Show inactive partners
            </label>
          )
        }
        countLabel={
          entityId
            ? showInactive
              ? `${activeCount} active · ${inactiveCount} inactive`
              : `${total} active partner${total === 1 ? "" : "s"}`
            : "Select a restaurant in the sidebar"
        }
        summary={
          shareWarning && (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {shareWarning}
            </p>
          )
        }
        skeletonColumns={4}
        isEmpty={Boolean(entityId) && displayRows.length === 0}
        empty={
          <EmptyState
            icon={Handshake}
            title="No partners yet"
            hint="Track expenses partners paid and reimbursements."
          />
        }
        table={<PartnerTable {...listProps} />}
        mobile={<PartnerCardList {...listProps} />}
      >
        <PartnerForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSaved={() => void reload()}
        />
        <PartnerProfitAllocationForm
          open={allocateOpen}
          onClose={() => setAllocateOpen(false)}
          onSaved={() => {
            void reload();
            setBalanceRefresh((value) => value + 1);
          }}
        />
      </ListPage>
    </AppShell>
  );

}
