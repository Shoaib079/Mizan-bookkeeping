import { cn } from "@/lib/utils";

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

export function PageSkeleton({ className }: { className?: string }) {
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
