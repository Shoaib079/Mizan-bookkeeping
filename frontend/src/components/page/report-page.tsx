"use client";

/** The shape every report takes (DESIGN_ARCHETYPES §8).
 *
 * All twelve repeated the same six lines by hand: a period control on the left,
 * a download menu on the right, then the same four states — no restaurant
 * selected, forbidden, error, loading — before any figures. Each wrote its own
 * spacing for that row, so the controls sat at slightly different heights from
 * one report to the next.
 *
 * Mirrors the PDF and Excel exports (shared header, KPI band, ruled totals) so
 * a report reads the same on screen as it does on paper. */

import { ForbiddenMessage } from "@/components/reports/forbidden-message";
import { PageHeader } from "@/components/page/page-header";
import type { OverflowMenuItem } from "@/components/ui/overflow-menu";
import { PageSkeleton } from "@/components/ui/skeleton";
import { useShowsSkeleton } from "@/lib/use-shows-skeleton";

type Props = {
  title: string;
  meta?: React.ReactNode;

  /** `ReportDateRange` or `ReportAsOfDate` — the period this report answers. */
  periodControl?: React.ReactNode;
  /** `ReportDownloadMenu`, and anything beside it. */
  downloads?: React.ReactNode;
  overflowActions?: OverflowMenuItem[];

  /** KPI cards above the statement — `StatCard`s, never bespoke boxes. */
  kpis?: React.ReactNode;
  /** Sealed-period banner, opening-balances note: shown once figures exist. */
  banner?: React.ReactNode;
  /** The statement itself. */
  children?: React.ReactNode;

  /** No restaurant chosen — every report says the same thing. */
  entityId?: string | null;
  loading?: boolean;
  error?: string | null;
  forbidden?: boolean;
  /** Named in the forbidden message: "…access to the balance sheet". */
  forbiddenContext?: string;
  /** False while the fetch has not produced figures yet. */
  hasReport?: boolean;
  className?: string;
};

export function ReportPage({
  title,
  meta,
  periodControl,
  downloads,
  overflowActions,
  kpis,
  banner,
  children,
  entityId,
  loading = false,
  error,
  forbidden = false,
  forbiddenContext,
  hasReport = true,
  className,
}: Props) {
  const showsSkeleton = useShowsSkeleton(loading);

  return (
    <div className={className}>
      <PageHeader
        title={title}
        meta={meta}
        actions={downloads}
        overflowActions={overflowActions}
      />

      {periodControl && <div className="mb-6">{periodControl}</div>}

      {entityId === null && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}
      {forbidden && <ForbiddenMessage context={forbiddenContext} />}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {showsSkeleton && <PageSkeleton />}

      {!showsSkeleton && !forbidden && hasReport && (
        <>
          {banner}
          {kpis && <div className="mb-6">{kpis}</div>}
          {children}
        </>
      )}
    </div>
  );
}
