"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

export function MobileCardList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-sm divide-y divide-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MobileCardRow({
  href,
  onClick,
  title,
  meta,
  amount,
  amountNote,
  amountClassName,
  trailing,
}: {
  /** Where the row leads. Omit when it opens something in place. */
  href?: string;
  /** For rows that open a dialog rather than navigate — the review screens
   * work that way, and without this they could not use this component at all
   * and would have forked their own card instead. */
  onClick?: () => void;
  title: React.ReactNode;
  meta?: React.ReactNode;
  amount?: React.ReactNode;
  /** Small caption under the amount (e.g. supplier advance qualifier). */
  amountNote?: React.ReactNode;
  amountClassName?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <RowShell href={href} onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 truncate text-sm font-medium leading-snug">
          {title}
        </div>
        {(amount !== undefined || trailing) && (
          <div className="flex max-w-[42%] shrink-0 flex-col items-end gap-0.5 pl-2 text-right">
            {amount !== undefined && (
              <div
                className={cn(
                  "whitespace-nowrap text-sm font-semibold tabular-nums",
                  amountClassName,
                )}
              >
                {amount}
              </div>
            )}
            {amountNote && (
              <div className="text-[11px] leading-snug text-muted-foreground">
                {amountNote}
              </div>
            )}
            {trailing}
          </div>
        )}
      </div>
      {meta && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {meta}
        </div>
      )}
    </RowShell>
  );
}

/** A link, a button, or neither — whichever the row actually is.
 *
 * min-h-[52px] on all three: a card is the primary tap target on a phone and
 * has to clear the same 44px a button does. */
function RowShell({
  href,
  onClick,
  children,
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const shell = "flex min-h-[52px] w-full flex-col gap-1 px-4 py-3.5 text-left";
  if (href) {
    return (
      <Link href={href} className={cn(shell, "active:bg-muted/60")}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(shell, "active:bg-muted/60")}>
        {children}
      </button>
    );
  }
  return <div className={shell}>{children}</div>;
}

export function MobileCardListSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card divide-y divide-border",
        className,
      )}
      aria-busy
      aria-label="Loading list"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2 px-4 py-3.5">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
