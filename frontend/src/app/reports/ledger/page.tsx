"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  CorrectLedgerEntryForm,
  type CorrectableLedgerEntry,
} from "@/components/forms/correct-ledger-entry-form";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";

type JournalEntryLine = {
  account_id: string;
  amount_kurus: number;
  side: "debit" | "credit";
};

type JournalEntryRow = {
  id: string;
  entry_date: string;
  description: string;
  status: string;
  source: string;
  lines: JournalEntryLine[];
};

const CORRECTABLE_SOURCES = new Set(["manual", "bank_fee"]);

export default function LedgerEntriesPage() {
  const { entityId } = useEntity();
  const [items, setItems] = useState<JournalEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [correctTarget, setCorrectTarget] = useState<CorrectableLedgerEntry | null>(
    null,
  );

  const reload = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const [manualRes, bankFeeRes] = await Promise.all([
        apiFetch<{ items: JournalEntryRow[] }>(
          `/entities/${entityId}/ledger/entries?status=posted&source=manual&limit=50`,
        ),
        apiFetch<{ items: JournalEntryRow[] }>(
          `/entities/${entityId}/ledger/entries?status=posted&source=bank_fee&limit=50`,
        ),
      ]);
      const merged = [...manualRes.items, ...bankFeeRes.items].sort((a, b) =>
        b.entry_date.localeCompare(a.entry_date),
      );
      setItems(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    setItems([]);
    setCorrectTarget(null);
    void reload();
  }, [entityId, reload]);

  function entryTotalKurus(lines: JournalEntryLine[]): number {
    return lines.reduce(
      (sum, line) => sum + (line.side === "debit" ? line.amount_kurus : 0),
      0,
    );
  }

  if (!entityId) {
    return (
      <AppShell title="Ledger entries">
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Ledger entries">
      <div className="mb-4">
        <Link href="/reports" className="text-sm text-primary hover:underline">
          ← Reports
        </Link>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Correct manual journals and bank fees here. Subledger-backed entries
        (payments, invoices, FX, etc.) must use their dedicated correction
        flows.
      </p>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading entries…</p>
      )}

      {!loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No correctable posted entries.
        </p>
      )}

      {items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Date</DataTableHeaderCell>
              <DataTableHeaderCell>Source</DataTableHeaderCell>
              <DataTableHeaderCell>Description</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
              <DataTableHeaderCell>Actions</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>{formatTrDate(row.entry_date)}</DataTableCell>
                <DataTableCell>{row.source}</DataTableCell>
                <DataTableCell>{row.description}</DataTableCell>
                <DataTableCell>
                  <StatusBadge status={row.status} />
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(entryTotalKurus(row.lines))}
                </DataTableCell>
                <DataTableCell align="right">
                  {row.status === "posted" &&
                    CORRECTABLE_SOURCES.has(row.source) && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-8 px-2"
                        onClick={() =>
                          setCorrectTarget({
                            id: row.id,
                            entry_date: row.entry_date,
                            description: row.description,
                            source: row.source,
                            lines: row.lines,
                          })
                        }
                      >
                        Correct
                      </Button>
                    )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <CorrectLedgerEntryForm
        open={correctTarget !== null}
        entry={correctTarget}
        onClose={() => setCorrectTarget(null)}
        onSaved={() => void reload()}
      />
    </AppShell>
  );
}
