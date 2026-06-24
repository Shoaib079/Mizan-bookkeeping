"use client";

/** Account transfers — Phase 9 Slice 4. */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { TransferForm } from "@/components/forms/transfer-form";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import type { AccountTransferRead } from "@/lib/banking-types";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { useEntityList } from "@/lib/use-entity-list";

type MoneyAccount = { id: string; name: string };

export default function TransfersPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error, reload } =
    useEntityList<AccountTransferRead>("/banking/transfers", entityId);
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [transferOpen, setTransferOpen] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const res = await apiFetch<{ items: MoneyAccount[] }>(
      `/entities/${entityId}/banking/accounts?limit=100`,
    );
    const map: Record<string, string> = {};
    for (const a of res.items) map[a.id] = a.name;
    setAccounts(map);
  }, [entityId]);

  useEffect(() => {
    void loadAccounts().catch(() => undefined);
  }, [loadAccounts]);

  function accountName(id: string) {
    return accounts[id] ?? id.slice(0, 8);
  }

  return (
    <AppShell title="Transfers">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/banking" className="text-sm text-primary hover:underline">
          ← Banking
        </Link>
        <Button
          type="button"
          disabled={!entityId}
          onClick={() => setTransferOpen(true)}
        >
          New transfer
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading transfers…</p>
      )}

      {!loading && entityId && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No transfers recorded yet.
        </p>
      )}

      {items.length > 0 && (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {total} transfer{total === 1 ? "" : "s"}
          </p>
          <DataTable>
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Date</DataTableHeaderCell>
                <DataTableHeaderCell>From</DataTableHeaderCell>
                <DataTableHeaderCell>To</DataTableHeaderCell>
                <DataTableHeaderCell>Description</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {items.map((row) => (
                <DataTableRow key={row.id}>
                  <DataTableCell>
                    {formatTrDate(row.transfer_date)}
                  </DataTableCell>
                  <DataTableCell>
                    {accountName(row.from_money_account_id)}
                  </DataTableCell>
                  <DataTableCell>
                    {accountName(row.to_money_account_id)}
                  </DataTableCell>
                  <DataTableCell>{row.description}</DataTableCell>
                  <DataTableCell align="right">
                    {formatTry(row.amount_kurus)}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        </>
      )}

      <TransferForm
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onTransferred={() => void reload()}
      />
    </AppShell>
  );
}
