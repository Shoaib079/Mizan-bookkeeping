"use client";

import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

export function DataTable({
  children,
  className,
  tableClassName,
  wide = false,
}: {
  children: React.ReactNode;
  className?: string;
  tableClassName?: string;
  /** A table with more columns than a phone can show.
   *
   * `overflow-auto` around a `w-full` table does not scroll — the table fits
   * itself to the container and compresses the columns instead, wrapping each
   * cell into a tall stack and pushing the last columns off the edge where
   * they cannot be reached at all. On a supplier ledger that meant the NET
   * column was simply invisible on a phone.
   *
   * A minimum width gives the overflow something to scroll, and the first
   * column is pinned so the date or name stays in view while you do. */
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-auto rounded-lg border border-border bg-card shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <table
        className={cn(
          "w-full text-sm",
          wide && [
            "min-w-[46rem]",
            // Keep the first column readable while the rest scrolls under it.
            "[&_th:first-child]:sticky [&_td:first-child]:sticky",
            "[&_th:first-child]:left-0 [&_td:first-child]:left-0",
            "[&_td:first-child]:bg-card [&_th:first-child]:bg-muted",
            "[&_th:first-child]:z-20",
          ],
          tableClassName,
        )}
      >
        {children}
      </table>
    </div>
  );
}

export function DataTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 text-left text-xs text-muted-foreground backdrop-blur-sm">
      {children}
    </thead>
  );
}

export function DataTableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function DataTableRow({
  children,
  className,
  href,
  ...props
}: React.ComponentPropsWithoutRef<"tr"> & {
  /** When set, the whole row is clickable and navigates here. Clicks on inner
   * links/buttons/inputs and modifier-clicks (⌘/ctrl/shift, middle) are left
   * alone so open-in-new-tab and row actions still work. */
  href?: string;
}) {
  const router = useRouter();

  if (!href) {
    return (
      <tr
        className={cn(
          "transition-colors duration-150 hover:bg-muted/40",
          className,
        )}
        {...props}
      >
        {children}
      </tr>
    );
  }

  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    target.closest("a,button,input,select,textarea,label,[role=button]") !== null;

  return (
    <tr
      role="link"
      tabIndex={0}
      className={cn(
        "cursor-pointer transition-colors duration-150 hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none",
        className,
      )}
      onClick={(event) => {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          isInteractiveTarget(event.target)
        ) {
          return;
        }
        router.push(href);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !isInteractiveTarget(event.target)) {
          router.push(href);
        }
      }}
      {...props}
    >
      {children}
    </tr>
  );
}

export function DataTableCell({
  children,
  className,
  align = "left",
  colSpan,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
  colSpan?: number;
  /** e.g. stopPropagation for action cells inside clickable rows. */
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "px-4 py-2.5",
        align === "right" && "text-right tabular-nums",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </td>
  );
}

export function DataTableHeaderCell({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "px-4 py-2 text-[11px] font-medium uppercase tracking-wider",
        align === "right" && "text-right",
      )}
    >
      {children}
    </th>
  );
}
