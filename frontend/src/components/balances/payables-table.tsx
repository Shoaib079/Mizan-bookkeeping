"use client";

import Link from "next/link";
import { HandCoins } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";

type PayableRow = {
  supplier_id: string;
  supplier_name: string;
  vkn: string;
  balance_kurus: number;
};

type PayablesSummary = {
  total_payables_kurus: number;
  suppliers: PayableRow[];
  total: number;
};

export function PayablesTable() {
  const { entityId } = useEntity();
  const [summary, setSummary] = useState<PayablesSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!entityId) {
      setSummary(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<PayablesSummary>(
        `/entities/${entityId}/payables?limit=100`,
      );
      setSummary(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows =
    summary?.suppliers.filter((s) => s.balance_kurus !== 0) ?? [];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? "Outstanding amounts you owe suppliers — includes unpaid posted invoices from any month."
            : "Select a restaurant in the sidebar"}
        </p>
        {entityId && (
          <Link
            href="/suppliers"
            className="text-sm text-primary hover:underline"
          >
            Supplier directory →
          </Link>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={3} />}

      {summary && !loading && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total payables</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatTry(summary.total_payables_kurus)}
          </p>
        </div>
      )}

      {!loading && entityId && rows.length === 0 && (
        <EmptyState
          icon={HandCoins}
          title="No outstanding payables"
          hint={
            <>
              Balances appear after you post supplier invoices to the ledger.
              Check{" "}
              <Link href="/review/invoices" className="text-primary hover:underline">
                Review → Invoices
              </Link>{" "}
              for confirmed uploads waiting to post, or{" "}
              <Link href="/suppliers" className="text-primary hover:underline">
                Suppliers
              </Link>{" "}
              to open a supplier ledger.
            </>
          }
        />
      )}

      {rows.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Supplier</DataTableHeaderCell>
              <DataTableHeaderCell>VKN</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Balance</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {rows.map((row) => (
              <DataTableRow key={row.supplier_id}>
                <DataTableCell>
                  <Link
                    href={`/suppliers/${row.supplier_id}`}
                    className="text-primary hover:underline"
                  >
                    {row.supplier_name}
                  </Link>
                </DataTableCell>
                <DataTableCell>{row.vkn}</DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.balance_kurus)}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </>
  );
}
