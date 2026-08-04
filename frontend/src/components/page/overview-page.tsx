"use client";

/** The dashboard's shape (DESIGN_ARCHETYPES §4b).
 *
 * The dashboard is not a tile grid and must not be forced into one: it is a
 * period control, a row of figures, and then sections that drill down. It gets
 * its own archetype so it shares the header, the card shape, the money rules
 * and the empty states with every other page while keeping its own body.
 *
 * Only `/` uses this. If a second page ever wants it, that is a sign the page
 * is really a hub or a list. */

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

  /** Anything above the figures — onboarding checklist, entity prompts. */
  banner?: React.ReactNode;
  /** Date range picker. Sits alone so it reads as the page's control. */
  periodControl?: React.ReactNode;
  /** The `StatCard` row. */
  stats?: React.ReactNode;
  /** Drill-down sections beneath, in order. */
  children?: React.ReactNode;

  loading?: boolean;
  error?: string | null;
  className?: string;
};

export function OverviewPage({
  title,
  meta,
  primaryAction,
  actions,
  overflowActions,
  banner,
  periodControl,
  stats,
  children,
  loading = false,
  error,
  className,
}: Props) {
  return (
    <div className={className}>
      <PageHeader
        title={title}
        meta={meta}
        primaryAction={primaryAction}
        actions={actions}
        overflowActions={overflowActions}
      />

      {banner}

      {periodControl && <div className="mb-6">{periodControl}</div>}

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {loading ? (
        <PageSkeleton />
      ) : (
        <>
          {stats}
          {children}
        </>
      )}
    </div>
  );
}

/** A titled block on the overview — "Right now", "Recent entries". */
export function OverviewSection({
  title,
  hint,
  controls,
  children,
  className,
}: {
  title: string;
  hint?: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-6", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && (
            <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
          )}
        </div>
        {controls}
      </div>
      {children}
    </section>
  );
}
