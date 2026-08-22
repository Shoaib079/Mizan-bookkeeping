"use client";

import { useCallback, useEffect, useState } from "react";

import {
  CorrectLedgerEntryForm,
  type CorrectableLedgerEntry,
} from "@/components/forms/correct-ledger-entry-form";
import {
  VoidManualJournalDialog,
  type VoidableManualJournal,
} from "@/components/forms/void-manual-journal-dialog";
import { VoidTriggerButton } from "@/components/ledger/void-trigger-button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import Link from "next/link";

import { ListPage } from "@/components/page/list-page";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { BookOpen } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { manualJournalVoidConfirmDetail } from "@/lib/ledger-void-confirm-detail";

type ManualJournalLine = {
  account_id: string;
  amount_kurus: number;
  side: "debit" | "credit";
};

type ManualJournalRow = {
  id: string;
  entry_date: string;
  description: string;
  status: string;
  lines: ManualJournalLine[];
};

/** The shape CorrectLedgerEntryForm needs. Shared so the phone card and the
 * desktop row cannot describe the same entry differently.
 *
 * Named for manual journals specifically: `lib/gl-edit-target.ts` has an
 * `editTargetFor` that answers a different question — which correction form
 * a General ledger row opens — and returns a different type. Two functions
 * with one name is a trap for a reader long before it is one for a guard
 * looking a symbol up. */
function manualJournalEditTarget(row: ManualJournalRow): CorrectableLedgerEntry {
  return {
    id: row.id,
    entry_date: row.entry_date,
    description: row.description,
    source: "manual",
    lines: row.lines.map((line) => ({
      account_id: line.account_id,
      amount_kurus: line.amount_kurus,
      side: line.side,
    })),
  };
}

export function ManualJournalsPanel() {
  const { entityId } = useEntity();
  const [items, setItems] = useState<ManualJournalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<VoidableManualJournal | null>(
    null,
  );
  // Amending reuses the general ledger's correction form: a manual journal is
  // a MANUAL-source entry, which is generic-correctable, so the same
  // void-and-repost endpoint applies. Nothing manual-journal-specific here.
  const [editTarget, setEditTarget] = useState<CorrectableLedgerEntry | null>(
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
    <ListPage
      title="Manual journals"
      meta="Posted manual journals — void with audit trail (accountant access)."
      primaryAction={
        <Link href="/review/manual-journals/new">
          <Button type="button">New journal</Button>
        </Link>
      }
      loading={loading}
      error={error}
      countLabel={
        items.length > 0
          ? `${items.length} posted journal${items.length === 1 ? "" : "s"}`
          : undefined
      }
      skeletonColumns={5}
      isEmpty={items.length === 0}
      empty={
        <EmptyState
          icon={BookOpen}
          title="No posted manual journals yet"
          hint="Manual journals posted by your accountant appear here for review and void."
        />
      }
      mobile={
        // Description leads: it is the only record of why the entry exists,
        // and in a five-column table on a phone it was the first thing
        // squeezed. Edit and Void stay on the card rather than behind a tap —
        // they are the whole reason this screen exists.
        <MobileCardList>
          {items.map((row) => (
            <MobileCardRow
              key={row.id}
              title={row.description}
              amount={formatTry(entryTotalKurus(row.lines))}
              meta={
                <>
                  <span>{formatTrDate(row.entry_date)}</span>
                  <StatusBadge status={row.status} />
                </>
              }
              trailing={
                row.status === "posted" ? (
                  <div className="mt-1 flex gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-2 text-xs"
                      onClick={() => setEditTarget(manualJournalEditTarget(row))}
                    >
                      Edit
                    </Button>
                    <VoidTriggerButton
                      className="px-2 text-xs text-destructive"
                      confirmDetail={manualJournalVoidConfirmDetail({
                        entry_date: row.entry_date,
                        description: row.description,
                        total_kurus: entryTotalKurus(row.lines),
                      })}
                      onContinue={() =>
                        setVoidTarget({
                          id: row.id,
                          entry_date: row.entry_date,
                          description: row.description,
                        })
                      }
                    />
                  </div>
                ) : undefined
              }
            />
          ))}
        </MobileCardList>
      }
      table={
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
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 px-2"
                        onClick={() => setEditTarget(manualJournalEditTarget(row))}
                      >
                        Edit
                      </Button>
                      <VoidTriggerButton
                        className="h-8 px-2 text-foreground hover:text-destructive"
                        confirmDetail={manualJournalVoidConfirmDetail({
                          entry_date: row.entry_date,
                          description: row.description,
                          total_kurus: entryTotalKurus(row.lines),
                        })}
                        onContinue={() =>
                          setVoidTarget({
                            id: row.id,
                            entry_date: row.entry_date,
                            description: row.description,
                          })
                        }
                      />
                    </div>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      }
    >
      <VoidManualJournalDialog
        open={voidTarget !== null}
        journal={voidTarget}
        onClose={() => setVoidTarget(null)}
        onSaved={() => void reload()}
      />
      <CorrectLedgerEntryForm
        open={editTarget !== null}
        entry={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => void reload()}
      />
    </ListPage>
  );
}
