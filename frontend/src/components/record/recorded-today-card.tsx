"use client";

/** Add page — journal entries posted for today's date. */

import { RecentEntriesCard } from "@/components/dashboard/recent-entries-card";
import {
  recordedTodayLedgerHref,
  recordedTodayListUrl,
  todayIsoDate,
} from "@/lib/recent-entries";

type Props = {
  entityId: string;
  className?: string;
};

export function RecordedTodayCard({ entityId, className }: Props) {
  const todayIso = todayIsoDate();

  return (
    <RecentEntriesCard
      entityId={entityId}
      className={className}
      title="Recorded today"
      listUrl={recordedTodayListUrl(entityId)}
      queryKey={["recorded-today", entityId, todayIso]}
      emptyMessage="Nothing recorded yet today"
      viewAllHref={recordedTodayLedgerHref()}
    />
  );
}
