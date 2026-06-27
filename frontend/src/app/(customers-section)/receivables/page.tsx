"use client";

import Link from "next/link";
import { Banknote } from "lucide-react";
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

type ReceivableRow = {
  customer_id: string;
  customer_name: string;
  identifier: string | null;
  balance_kurus: number;
};

type ReceivablesSummary = {
  total_receivables_kurus: number;
  customers: ReceivableRow[];
  total: number;
};

export default function ReceivablesPage() {
  const { entityId } = useEntity();
  const [summary, setSummary] = useState<ReceivablesSummary | null>(null);
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
      const res = await apiFetch<ReceivablesSummary>(
        `/entities/${entityId}/receivables?limit=100`,
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
    summary?.customers.filter((c) => c.balance_kurus !== 0) ?? [];

  return (
    <>
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? "Outstanding customer balances"
            : "Select a restaurant in the sidebar"}
        </p>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={3} />}

      {summary && !loading && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total receivables</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatTry(summary.total_receivables_kurus)}
          </p>
        </div>
      )}

      {!loading && entityId && rows.length === 0 && (
        <EmptyState
          icon={Banknote}
          title="No outstanding receivables"
          hint={
            <>
              Record credit sales from{" "}
              <Link href="/customers" className="text-primary hover:underline">
                Customers
              </Link>
              .
            </>
          }
        />
      )}

      {rows.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Customer</DataTableHeaderCell>
              <DataTableHeaderCell>Identifier</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Balance</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {rows.map((row) => (
              <DataTableRow key={row.customer_id}>
                <DataTableCell>
                  <Link
                    href={`/customers/${row.customer_id}`}
                    className="text-primary hover:underline"
                  >
                    {row.customer_name}
                  </Link>
                </DataTableCell>
                <DataTableCell>{row.identifier ?? "—"}</DataTableCell>
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
