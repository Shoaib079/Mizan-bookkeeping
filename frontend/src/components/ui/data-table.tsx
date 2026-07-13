"use client";

import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

export function DataTable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-auto rounded-lg border border-border bg-card shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <table className="w-full text-sm">{children}</table>
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
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
  /** e.g. stopPropagation for action cells inside clickable rows. */
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
}) {
  return (
    <td
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
