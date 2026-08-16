"use client";

/** Two-pane document review (DESIGN_ARCHETYPES §6).
 *
 * Receipts, invoices, POS summaries and delivery reports all ask the same
 * question: does what we read off this document match what it says? So they get
 * the same answer shape — the original on the left, the extracted fields and
 * the decision on the right, side by side so your eye can compare without
 * scrolling or switching tabs.
 *
 * Unlike a review queue (which is a `ListPage` with a `preview`), this is one
 * document at a time and genuinely is not a list. */

import { PageHeader } from "@/components/page/page-header";
import type { OverflowMenuItem } from "@/components/ui/overflow-menu";
import { PageSkeleton } from "@/components/ui/skeleton";
import { useShowsSkeleton } from "@/lib/use-shows-skeleton";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  meta?: React.ReactNode;
  primaryAction?: React.ReactNode;
  actions?: React.ReactNode;
  overflowActions?: OverflowMenuItem[];

  /** The original — scan, PDF, or the raw imported rows. */
  document?: React.ReactNode;
  /** Extracted fields, confidence, and the confirm/reject decision. */
  fields: React.ReactNode;
  /** Full-width below both panes: line items, matched entries. */
  children?: React.ReactNode;

  loading?: boolean;
  error?: string | null;
  className?: string;
};

export function DocumentReviewPage({
  title,
  meta,
  primaryAction,
  actions,
  overflowActions,
  document,
  fields,
  children,
  loading = false,
  error,
  className,
}: Props) {
  const showsSkeleton = useShowsSkeleton(loading);

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

      {showsSkeleton ? (
        <PageSkeleton />
      ) : (
        <>
          <div
            className={cn(
              "grid gap-4",
              // Without a document there is nothing to compare against, so the
              // fields take the full width rather than sitting in a half-empty
              // two-column grid.
              document && "lg:grid-cols-2",
            )}
          >
            {document && (
              <div className="rounded-lg border border-border bg-card p-4">
                {document}
              </div>
            )}
            <div className="rounded-lg border border-border bg-card p-4">
              {fields}
            </div>
          </div>
          {children && <div className="mt-6">{children}</div>}
        </>
      )}
    </div>
  );
}
