"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Handshake } from "lucide-react";

import type { PartnerRow } from "@/components/forms/partner-form";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiError, apiFetch } from "@/lib/api";
import {
  countInactiveDirectoryRows,
  directoryInactiveSplitIndex,
  sortDirectoryActiveFirst,
} from "@/lib/directory-list";
import { useEntity } from "@/lib/entity-context";
import {
  extractPartnerNetBalanceKurus,
  formatPartnerNetBalance,
  partnerBalanceHeading,
} from "@/lib/partner-balance";

type PartnerRowWithBalance = PartnerRow & {
  balance_kurus: number | null;
  balanceLoading: boolean;
};

type LedgerResponse = {
  net_balance_kurus: number;
  balance_kurus: number;
};

function formatSharePct(value: string | null): string {
  if (value == null || value === "") return "—";
  return `${value}%`;
}

export function PartnersBalancesTable() {
  const { entityId } = useEntity();
  const [showInactive, setShowInactive] = useState(false);
  const [rows, setRows] = useState<PartnerRowWithBalance[]>([]);
  const [shareWarning, setShareWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!entityId) {
      setRows([]);
      setShareWarning(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        items: PartnerRow[];
        ownership_share?: { warning: string | null };
      }>(
        `/entities/${entityId}/partners?include_inactive=${showInactive ? "true" : "false"}&limit=100`,
      );
      setShareWarning(res.ownership_share?.warning ?? null);
      const ordered = sortDirectoryActiveFirst(res.items);
      const initial: PartnerRowWithBalance[] = ordered.map((partner) => ({
        ...partner,
        balance_kurus: null,
        balanceLoading: true,
      }));
      setRows(initial);
      setLoading(false);

      await Promise.all(
        ordered.map(async (partner) => {
          try {
            const ledger = await apiFetch<LedgerResponse>(
              `/entities/${entityId}/partners/${partner.id}/ledger`,
            );
            const net = extractPartnerNetBalanceKurus(ledger);
            setRows((prev) =>
              prev.map((row) =>
                row.id === partner.id
                  ? {
                      ...row,
                      balance_kurus: net,
                      balanceLoading: false,
                    }
                  : row,
              ),
            );
          } catch {
            setRows((prev) =>
              prev.map((row) =>
                row.id === partner.id
                  ? { ...row, balance_kurus: 0, balanceLoading: false }
                  : row,
              ),
            );
          }
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("You do not have access to partners for this restaurant.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
      setRows([]);
      setShareWarning(null);
      setLoading(false);
    }
  }, [entityId, showInactive]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const inactiveSplitAt = useMemo(
    () => (showInactive ? directoryInactiveSplitIndex(rows) : undefined),
    [rows, showInactive],
  );
  const inactiveCount = useMemo(
    () => countInactiveDirectoryRows(rows),
    [rows],
  );
  const activeCount = showInactive ? rows.length - inactiveCount : rows.length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {entityId
              ? showInactive
                ? `${activeCount} active · ${inactiveCount} inactive`
                : `${rows.length} active partner${rows.length === 1 ? "" : "s"}`
              : "Cash-settleable position with each partner (fronted expenses, drawings, loans — not equity)"}
          </p>
          {entityId && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Show inactive partners
            </label>
          )}
        </div>
        {entityId && (
          <Link
            href="/partners"
            className="text-sm text-primary hover:underline"
          >
            Partner directory →
          </Link>
        )}
      </div>

      {shareWarning && (
        <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {shareWarning}
        </p>
      )}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={4} />}

      {!loading && entityId && rows.length === 0 && !error && (
        <EmptyState
          icon={Handshake}
          title="No partners yet"
          hint="Track partner-fronted expenses and reimbursements from Record."
        />
      )}

      {rows.length > 0 && (
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
            {rows.map((row, index) => (
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
                <DataTableRow>
                  <DataTableCell>
                    <Link
                      href={`/partners/${row.id}`}
                      className="text-primary hover:underline"
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
                  <DataTableCell align="right" className="tabular-nums">
                    {row.balanceLoading ? (
                      "…"
                    ) : (
                      <span title={partnerBalanceHeading(row.balance_kurus ?? 0)}>
                        {formatPartnerNetBalance(row.balance_kurus ?? 0)}
                      </span>
                    )}
                  </DataTableCell>
                </DataTableRow>
              </Fragment>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </>
  );
}
