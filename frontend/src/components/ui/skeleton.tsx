import { cn } from "@/lib/utils";
import { useShowsSkeleton } from "@/lib/use-shows-skeleton";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import { MobileCardListSkeleton } from "@/components/ui/mobile-card-list";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden
      {...props}
    />
  );
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
      aria-busy
      aria-label="Loading table"
    >
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex gap-4 px-4 py-3">
            {Array.from({ length: columns }).map((_, col) => (
              <Skeleton
                key={col}
                className={cn("h-4 flex-1", col === columns - 1 && "max-w-20")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The whole-page placeholder.
 *
 * `when` is the page's loading flag, and passing it is how a caller gets the
 * refresh behaviour for free: the skeleton draws until the first load
 * finishes, then stays out of the way while later fetches happen underneath
 * the content. Pages set `loading` on *every* fetch — including the background
 * ones React Query fires on window focus — so a caller writing
 * `{loading && <PageSkeleton />}` makes the page collapse and spring back each
 * time. Kept here rather than at each call site because twelve of them had to
 * get it right and one already had not.
 *
 * Always render it and pass `when`; never mount it conditionally. Unmounting
 * resets the "has anything loaded" memory, and the skeleton would return on
 * every refresh again.
 */
export function PageSkeleton({
  className,
  when,
}: {
  className?: string;
  when?: boolean;
}) {
  const showsSkeleton = useShowsSkeleton(when ?? true);
  if (!showsSkeleton) return null;
  return (
    <div className={cn("space-y-4", className)} aria-busy aria-label="Loading page">
      <Skeleton className="h-4 w-40" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <TableSkeleton />
    </div>
  );
}

/** Renders its children only once a first load has finished.
 *
 * The companion to `PageSkeleton when={...}`, for the pages that also hide
 * their content while loading. Gating that on the raw flag hid the content on
 * every background refresh too, so the page went blank rather than merely
 * losing its skeleton.
 *
 * Needed where "do we have anything yet" cannot be read off the data: the
 * General ledger renders "No entries in this range" for an empty result, so
 * an empty list is a real answer rather than a sign nothing has loaded.
 */
export function AfterFirstLoad({
  when,
  children,
}: {
  when: boolean;
  children: React.ReactNode;
}) {
  return useShowsSkeleton(when) ? null : <>{children}</>;
}

/** Table on desktop, card stack on mobile (C4.3). */
export function ListSkeleton({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  const isMobile = useIsMobileShell();
  if (isMobile) {
    return <MobileCardListSkeleton rows={rows} className={className} />;
  }
  return <TableSkeleton rows={rows} columns={columns} className={className} />;
}
