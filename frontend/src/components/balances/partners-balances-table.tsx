"use client";

import Link from "next/link";
import { Handshake } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";

type PartnerRowWithBalance = PartnerRow & {
  balance_kurus: number | null;
  balanceLoading: boolean;
};

type LedgerResponse = { balance_kurus: number };

function formatSharePct(value: string | null): string {
  if (value == null || value === "") return "—";
  return `${value}%`;
}

export function PartnersBalancesTable() {
  const { entityId } = useEntity();
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
      }>(`/entities/${entityId}/partners?include_inactive=true&limit=100`);
      setShareWarning(res.ownership_share?.warning ?? null);
      const initial: PartnerRowWithBalance[] = res.items.map((partner) => ({
        ...partner,
        balance_kurus: null,
        balanceLoading: true,
      }));
      setRows(initial);
      setLoading(false);

      await Promise.all(
        res.items.map(async (partner) => {
          try {
            const ledger = await apiFetch<LedgerResponse>(
              `/entities/${entityId}/partners/${partner.id}/ledger`,
            );
            setRows((prev) =>
              prev.map((row) =>
                row.id === partner.id
                  ? {
                      ...row,
                      balance_kurus: ledger.balance_kurus,
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
  }, [entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? "Amount the business owes each partner (fronted expenses)"
            : "Select a restaurant in the sidebar"}
        </p>
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
            {rows.map((row) => (
              <DataTableRow key={row.id}>
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
                  {row.balanceLoading
                    ? "…"
                    : formatTry(row.balance_kurus ?? 0)}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </>
  );
}
