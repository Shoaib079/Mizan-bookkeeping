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
        "overflow-auto rounded-lg border border-border bg-card",
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
  ...props
}: React.ComponentPropsWithoutRef<"tr">) {
  return (
    <tr className={cn("hover:bg-muted/20", className)} {...props}>
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
        "px-4 py-2 font-medium",
        align === "right" && "text-right",
      )}
    >
      {children}
    </th>
  );
}
