"use client";

/** Desktop table for RecentEntriesCard. */

import { EditedBadge } from "@/components/ledger/corrected-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { journalEntryRowClassName } from "@/lib/ledger-display";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  entryWasCorrected,
  journalEntryTotalKurus,
  journalSourceLabel,
  recentEntryStatusLabel,
  type RecentEntryRow,
} from "@/lib/recent-entries";
import { cn } from "@/lib/utils";

function EntryTableRow({
  entry,
  onOpen,
}: {
  entry: RecentEntryRow;
  onOpen: (row: RecentEntryRow) => void;
}) {
  const voided = entry.status === "voided";
  const corrected = entryWasCorrected(entry);

  return (
    <tr
      data-testid="recent-entry-row"
      data-entry-date={entry.entry_date}
      data-entry-status={entry.status ?? "posted"}
      className={cn(
        "cursor-pointer transition-colors hover:bg-muted/50",
        journalEntryRowClassName(entry.status ?? "posted"),
      )}
      onClick={() => onOpen(entry)}
    >
      <td
        data-testid="recent-entry-date"
        className="whitespace-nowrap px-2 py-2.5 text-xs text-muted-foreground tabular-nums"
      >
        {formatTrDate(entry.entry_date)}
      </td>
      <td className="px-2 py-2.5">
        <span
          data-testid="recent-entry-source"
          className="inline-flex rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground"
        >
          {journalSourceLabel(entry.source)}
        </span>
      </td>
      <td className="min-w-0 px-2 py-2.5 text-sm">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "min-w-0 truncate font-medium",
              voided && "line-through",
            )}
          >
            {entry.description}
          </span>
          {corrected && !voided ? <EditedBadge /> : null}
        </span>
      </td>
      <td
        className={cn(
          "whitespace-nowrap px-2 py-2.5 text-right text-sm tabular-nums font-medium",
          voided && "line-through",
        )}
        data-testid="recent-entry-amount"
      >
        {formatTry(journalEntryTotalKurus(entry.lines))}
      </td>
      <td className="whitespace-nowrap px-2 py-2.5 text-right text-xs text-muted-foreground">
        <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
          {voided ? <StatusBadge status="voided" /> : null}
          <span data-testid="recent-entry-status">
            {recentEntryStatusLabel(entry)}
          </span>
        </span>
      </td>
    </tr>
  );
}

export function RecentEntriesTable({
  items,
  onOpen,
}: {
  items: RecentEntryRow[];
  onOpen: (row: RecentEntryRow) => void;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[36rem] table-fixed border-collapse text-left">
        <colgroup>
          <col className="w-[6.5rem]" />
          <col className="w-[7rem]" />
          {/* Description absorbs leftover width so Amount/Status stay at the right edge. */}
          <col className="w-auto" />
          <col className="w-[8rem]" />
          <col className="w-[5.5rem]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-2 py-2 text-left">
              Date
            </th>
            <th scope="col" className="px-2 py-2 text-left">
              Type
            </th>
            <th scope="col" className="px-2 py-2 text-left">
              Description
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Amount
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((entry) => (
            <EntryTableRow key={entry.id} entry={entry} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
