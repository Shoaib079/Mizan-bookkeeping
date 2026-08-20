"use client";

/** The shape every entity detail page takes (DESIGN_ARCHETYPES §2).
 *
 * Header · headline figure · panels · activity. Staff, supplier, customer,
 * partner, bank account, FX wallet and delivery platform all fill the same
 * slots — only the contents differ, never the arrangement. */

import { PageHeader } from "@/components/page/page-header";
import type { OverflowMenuItem } from "@/components/ui/overflow-menu";
import { PageSkeleton } from "@/components/ui/skeleton";
import { useShowsSkeleton } from "@/lib/use-shows-skeleton";

type Props = {
  title: string;
  /** Acts on the name itself — "Edit customer" — beside the heading. */
  titleAction?: React.ReactNode;
  meta?: React.ReactNode;
  primaryAction?: React.ReactNode;
  actions?: React.ReactNode;
  overflowActions?: OverflowMenuItem[];

  /** Compact balance sticker in the header (partner / staff / supplier). */
  balance?: React.ReactNode;
  /** `HeadlineFigure` — legacy full-width slot; prefer `balance` for people pages. */
  headline?: React.ReactNode;
  /** 0–3 `SummaryPanel`s explaining that number. */
  panels?: React.ReactNode;
  /** Ledger / activity table, usually with its own filter chips. */
  activity?: React.ReactNode;

  loading?: boolean;
  error?: string | null;
  /** Shown instead of everything when access is denied. */
  forbidden?: React.ReactNode;
  /** Dialogs and drawers this page owns. */
  children?: React.ReactNode;
  className?: string;
};

export function EntityDetailPage({
  title,
  titleAction,
  meta,
  primaryAction,
  actions,
  overflowActions,
  balance,
  headline,
  panels,
  activity,
  loading = false,
  error,
  forbidden,
  children,
  className,
}: Props) {
  const showsSkeleton = useShowsSkeleton(loading);

  if (forbidden) {
    return (
      <>
        <PageHeader title={title} />
        {forbidden}
      </>
    );
  }

  return (
    <div className={className}>
      <PageHeader
        title={title}
        titleAction={titleAction}
        meta={meta}
        primaryAction={primaryAction}
        actions={actions}
        overflowActions={overflowActions}
        aside={balance}
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {showsSkeleton ? (
        <PageSkeleton />
      ) : (
        <>
          {(headline || panels) && (
            // Stacked on a phone, side by side above it. The panels are
            // `flex-1`, and in a plain flex-wrap row they shrink to share the
            // width rather than wrap — on a 375px screen a headline and two
            // summary cards came out around 110px each, too narrow for the
            // label-and-figure rows inside them.
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {headline}
              {panels}
            </div>
          )}
          {activity}
        </>
      )}

      {children}
    </div>
  );
}

/** Section wrapper used inside `activity` so every table gets the same
 * heading + controls treatment. */
export function DetailSection({
  title,
  controls,
  children,
  className,
}: {
  title: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {controls}
      </div>
      {children}
    </section>
  );
}
