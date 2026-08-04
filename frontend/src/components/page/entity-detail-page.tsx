"use client";

/** The shape every entity detail page takes (DESIGN_ARCHETYPES §2).
 *
 * Header · headline figure · panels · activity. Staff, supplier, customer,
 * partner, bank account, FX wallet and delivery platform all fill the same
 * slots — only the contents differ, never the arrangement. */

import { PageHeader } from "@/components/page/page-header";
import type { OverflowMenuItem } from "@/components/ui/overflow-menu";
import { PageSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  meta?: React.ReactNode;
  primaryAction?: React.ReactNode;
  actions?: React.ReactNode;
  overflowActions?: OverflowMenuItem[];

  /** `HeadlineFigure` — the one number this page answers. */
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
  meta,
  primaryAction,
  actions,
  overflowActions,
  headline,
  panels,
  activity,
  loading = false,
  error,
  forbidden,
  children,
  className,
}: Props) {
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
        meta={meta}
        primaryAction={primaryAction}
        actions={actions}
        overflowActions={overflowActions}
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {loading ? (
        <PageSkeleton />
      ) : (
        <>
          {(headline || panels) && (
            <div className={cn("mb-6 flex flex-wrap gap-3")}>
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
