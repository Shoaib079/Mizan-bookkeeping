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

  /** Search box, filter chips, date range — laid out on one line. */
  toolbar?: React.ReactNode;
  /** "83 suppliers" — the honest count, always shown. */
  countLabel?: React.ReactNode;

  /** Desktop table. */
  table: React.ReactNode;
  /** Card list for narrow screens; falls back to the table when omitted. */
  mobile?: React.ReactNode;

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
  toolbar,
  countLabel,
  table,
  mobile,
  empty,
  isEmpty = false,
  pager,
  footer,
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
        </>
      )}

      {children}
    </div>
  );
}
