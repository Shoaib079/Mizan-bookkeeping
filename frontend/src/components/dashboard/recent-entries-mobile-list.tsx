"use client";

/** Phone card list for RecentEntriesCard. */

import { EditedBadge } from "@/components/ledger/corrected-badge";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  moneyAmountClassName,
  moneyLeadingIcon,
} from "@/lib/mobile-ledger-card";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  entryWasCorrected,
  journalEntryTotalKurus,
  journalSourceLabel,
  recentEntryStatusLabel,
  type RecentEntryRow,
} from "@/lib/recent-entries";
import { cn } from "@/lib/utils";

function EntryMobileCard({
  entry,
  onOpen,
}: {
  entry: RecentEntryRow;
  onOpen: (row: RecentEntryRow) => void;
}) {
  const voided = entry.status === "voided";
  const corrected = entryWasCorrected(entry);
  const amount = journalEntryTotalKurus(entry.lines);

  return (
    <MobileCardRow
      onClick={() => onOpen(entry)}
      title={
        <span
          data-testid="recent-entry-row"
          data-entry-date={entry.entry_date}
          data-entry-status={entry.status ?? "posted"}
          className="flex min-w-0 flex-wrap items-center gap-1.5"
        >
          <span className={cn("min-w-0 truncate", voided && "line-through")}>
            {entry.description}
          </span>
          {corrected && !voided ? <EditedBadge /> : null}
        </span>
      }
      meta={
        <>
          <span data-testid="recent-entry-date">
            {formatTrDate(entry.entry_date)}
          </span>
          <span aria-hidden>·</span>
          <span data-testid="recent-entry-source">
            {journalSourceLabel(entry.source)}
          </span>
          {voided ? (
            <>
              <span aria-hidden>·</span>
              <StatusBadge status="voided" />
            </>
          ) : null}
        </>
      }
      amount={
        <span data-testid="recent-entry-amount">{formatTry(amount)}</span>
      }
      amountClassName={cn(
        moneyAmountClassName(amount),
        voided && "line-through",
      )}
      leadingIcon={moneyLeadingIcon(amount)}
      trailing={
        <span
          data-testid="recent-entry-status"
          className="text-xs text-muted-foreground"
        >
          {recentEntryStatusLabel(entry)}
        </span>
      }
    />
  );
}

export function RecentEntriesMobileList({
  items,
  onOpen,
}: {
  items: RecentEntryRow[];
  onOpen: (row: RecentEntryRow) => void;
}) {
  return (
    <MobileCardList>
      {items.map((entry) => (
        <EntryMobileCard key={entry.id} entry={entry} onOpen={onOpen} />
      ))}
    </MobileCardList>
  );
}
