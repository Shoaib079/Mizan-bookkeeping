"use client";

/** Record desk — last N journal entries (any date), newest first. */

import { RecentEntriesCard } from "@/components/dashboard/recent-entries-card";
import { recentEntriesListUrl } from "@/lib/recent-entries";

type Props = {
  entityId: string;
  className?: string;
};

export function RecentlyRecordedCard({ entityId, className }: Props) {
  return (
    <RecentEntriesCard
      entityId={entityId}
      className={className}
      title="Recently recorded"
      listUrl={recentEntriesListUrl(entityId, {
        limit: 25,
        effectiveOnly: true,
      })}
      queryKey={["recently-recorded", entityId]}
      emptyMessage="Nothing recorded yet"
      viewAllHref="/reports/ledger"
    />
  );
}
