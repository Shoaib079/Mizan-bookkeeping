"use client";

import { useCallback, useEffect, useState } from "react";

import {
  VoidManualJournalDialog,
  type VoidableManualJournal,
} from "@/components/forms/void-manual-journal-dialog";
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

type ManualJournalLine = {
  amount_kurus: number;
  side: string;
};

type ManualJournalRow = {
  id: string;
  entry_date: string;
  description: string;
  status: string;
  lines: ManualJournalLine[];
};

export function ManualJournalsPanel() {
  const { entityId } = useEntity();
  const [items, setItems] = useState<ManualJournalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<VoidableManualJournal | null>(
    null,
  );

  const reload = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ items: ManualJournalRow[] }>(
        `/entities/${entityId}/manual-journals?status=posted&limit=50`,
      );
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    setItems([]);
    setVoidTarget(null);
    void reload();
  }, [entityId, reload]);

  function entryTotalKurus(lines: ManualJournalLine[]): number {
    return lines.reduce(
      (sum, line) => sum + (line.side === "debit" ? line.amount_kurus : 0),
      0,
    );
  }

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Posted manual journals — void with audit trail (accountant access).
      </p>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading journals…</p>
      )}

      {!loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No posted manual journals yet.
        </p>
      )}

      {items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Date</DataTableHeaderCell>
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
                <DataTableCell>{row.description}</DataTableCell>
                <DataTableCell>
                  <StatusBadge status={row.status} />
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(entryTotalKurus(row.lines))}
                </DataTableCell>
                <DataTableCell align="right">
                  {row.status === "posted" && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 px-2"
                      onClick={() =>
                        setVoidTarget({
                          id: row.id,
                          entry_date: row.entry_date,
                          description: row.description,
                        })
                      }
                    >
                      Void
                    </Button>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <VoidManualJournalDialog
        open={voidTarget !== null}
        journal={voidTarget}
        onClose={() => setVoidTarget(null)}
        onSaved={() => void reload()}
      />
    </>
  );
}
