"use client";

/** What moved a sealed month after it was closed.
 *
 * The badge says a month changed and the report says by how much. Neither
 * answers "which entry", which is the only question that leads anywhere.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { apiFetch } from "@/lib/api";
import { formatTrDate, formatTry } from "@/lib/money";
import { changeKindLabel, changesSummary } from "@/lib/month-close";
import type { SealedMonthChangesRead } from "@/lib/report-types";
import { ledgerEntryHref, sourceLabel } from "@/lib/transaction-registry";
import { cn } from "@/lib/utils";

type Props = {
  entityId: string;
  lockId: string;
};

export function SealedMonthChanges({ entityId, lockId }: Props) {
  const [changes, setChanges] = useState<SealedMonthChangesRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!entityId || !lockId) return;
    setError(null);
    try {
      const res = await apiFetch<SealedMonthChangesRead>(
        `/entities/${entityId}/period-locks/${lockId}/changes`,
      );
      setChanges(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setChanges(null);
    }
  }, [entityId, lockId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!changes || changes.entries.length === 0) return null;

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">What changed since the close</h2>
        <p className="text-xs text-muted-foreground">
          {changesSummary(changes)}
        </p>
      </div>

      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Changed</DataTableHeaderCell>
            <DataTableHeaderCell>What</DataTableHeaderCell>
            <DataTableHeaderCell>Dated</DataTableHeaderCell>
            <DataTableHeaderCell>Recorded as</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {changes.entries.map((entry) => (
            <DataTableRow key={`${entry.journal_entry_id}-${entry.change_kind}`}>
              <DataTableCell>
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-xs font-medium",
                    entry.change_kind === "voided" &&
                      "bg-destructive/10 text-destructive",
                    entry.change_kind === "posted" && "bg-warning/10 text-warning",
                    entry.change_kind === "reversal" &&
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {changeKindLabel(entry.change_kind)}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatTrDate(entry.changed_at.slice(0, 10))}
                </span>
              </DataTableCell>
              <DataTableCell>
                <Link
                  href={ledgerEntryHref(entry.journal_entry_id)}
                  className="hover:underline"
                >
                  {entry.description}
                </Link>
              </DataTableCell>
              <DataTableCell className="text-muted-foreground">
                {formatTrDate(entry.entry_date)}
              </DataTableCell>
              <DataTableCell className="text-muted-foreground">
                {sourceLabel(entry.source)}
              </DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {formatTry(entry.amount_kurus)}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {changes.reasons.length > 0 && (
        <div className="mt-3 rounded-md border border-dashed border-border p-3">
          <p className="text-xs font-medium">Reasons given</p>
          <ul className="mt-1 space-y-1">
            {changes.reasons.map((reason, index) => (
              <li
                key={`${reason.created_at}-${index}`}
                className="text-xs text-muted-foreground"
              >
                {formatTrDate(reason.created_at.slice(0, 10))} —{" "}
                {reason.reason || "(no reason recorded)"}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Reasons are listed in order, not matched to individual entries —
            they&apos;re recorded before the entry exists.
          </p>
        </div>
      )}
    </section>
  );
}
