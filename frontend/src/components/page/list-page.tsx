"use client";

/** The shape every list page takes (DESIGN_ARCHETYPES §3).
 *
 * Header · toolbar · count · rows · pager · footer total. Crucially this owns
 * the mobile breakpoint: pages used to each write their own
 * `isMobile ? cards : table` fork, which is how they drifted apart. */

import { PageHeader } from "@/components/page/page-header";
import type { OverflowMenuItem } from "@/components/ui/overflow-menu";
import { ListSkeleton } from "@/components/ui/skeleton";
import { TablePager } from "@/components/ui/table-pager";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  meta?: React.ReactNode;
  primaryAction?: React.ReactNode;
  actions?: React.ReactNode;
  overflowActions?: OverflowMenuItem[];
  /** When section tabs already name this list — hide the H1 on desktop only. */
  hideTitleOnDesktop?: boolean;

  /** Search box, filter chips, date range — laid out on one line. */
  toolbar?: React.ReactNode;
  /** "83 suppliers" — the honest count, always shown. */
  countLabel?: React.ReactNode;
  /** A figure the whole list rolls up to, above the rows — total payables,
   * total receivable. Use `HeadlineFigure`/`SummaryPanel`, not a bespoke card. */
  summary?: React.ReactNode;

  /** Desktop table. */
  table: React.ReactNode;
  /** Card list for narrow screens; falls back to the table when omitted. */
  mobile?: React.ReactNode;
  /** `FilterChips` and anything like them. Given their own row under the
   * toolbar: sharing a flex row with the period control left the chips
   * stranded mid-line between the dates and the row count, reading as though
   * they belonged to neither. */
  filters?: React.ReactNode;

  /** Rendered when there are no rows — must name the next action. */
  empty?: React.ReactNode;
  isEmpty?: boolean;

  /** Paging comes from `useEntityList`. */
  pager?: {
    offset: number;
    pageSize: number;
    total: number;
    onOffsetChange: (offset: number) => void;
  };
  /** Total line under the table ("Total payable: …"). */
  footer?: React.ReactNode;
  /** Detail for the selected row, shown under the rows. Review queues open a
   * document or draft in place rather than navigating away. */
  preview?: React.ReactNode;

  loading?: boolean;
  error?: string | null;
  forbidden?: React.ReactNode;
  /** Skeleton column count while loading. */
  skeletonColumns?: number;
  children?: React.ReactNode;
  className?: string;
};

export function ListPage({
  title,
  meta,
  primaryAction,
  actions,
  overflowActions,
  hideTitleOnDesktop = false,
  toolbar,
  countLabel,
  summary,
  table,
  mobile,
  filters,
  empty,
  isEmpty = false,
  pager,
  footer,
  preview,
  loading = false,
  error,
  forbidden,
  skeletonColumns = 4,
  children,
  className,
}: Props) {
  const isMobile = useIsMobileShell();

  return (
    <div className={className}>
      <PageHeader
        title={title}
        meta={meta}
        primaryAction={primaryAction}
        actions={actions}
        overflowActions={overflowActions}
        hideTitleOnDesktop={hideTitleOnDesktop}
      />

      {(toolbar || countLabel) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div
            className={cn(
              "flex flex-wrap items-center gap-2",
              isMobile && "w-full",
            )}
          >
            {toolbar}
          </div>
          {countLabel && (
            <p className="text-sm text-muted-foreground">{countLabel}</p>
          )}
        </div>
      )}

      {summary && !forbidden && (
        <div className="mb-5 flex flex-wrap gap-3">{summary}</div>
      )}

      {filters && (
        <div className="mb-4 flex flex-wrap items-center gap-2">{filters}</div>
      )}

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {forbidden}

      {!forbidden && loading && <ListSkeleton columns={skeletonColumns} />}

      {!forbidden && !loading && isEmpty && empty}

      {!forbidden && !loading && !isEmpty && (
        <>
          {isMobile && mobile ? mobile : table}
          {pager && (
            <TablePager
              offset={pager.offset}
              pageSize={pager.pageSize}
              total={pager.total}
              disabled={loading}
              onOffsetChange={pager.onOffsetChange}
            />
          )}
          {footer && (
            <p className="mt-4 text-xs text-muted-foreground">{footer}</p>
          )}
          {preview && <div className="mt-4">{preview}</div>}
        </>
      )}

      {children}
    </div>
  );
}
