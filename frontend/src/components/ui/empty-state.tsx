import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <Icon className="mb-3 size-10 text-muted-foreground/60" aria-hidden />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{hint}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
