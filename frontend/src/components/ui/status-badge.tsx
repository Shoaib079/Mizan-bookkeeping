import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  posted: "bg-success/10 text-success",
  needs_review: "bg-warning/10 text-warning",
  draft: "bg-muted text-muted-foreground",
  rejected: "bg-destructive/10 text-destructive",
  confirmed: "bg-primary/10 text-primary",
  duplicate: "bg-warning/10 text-warning",
  active: "bg-success/10 text-success",
  inactive: "bg-muted text-muted-foreground",
};

const statusLabels: Record<string, string> = {
  posted: "Posted",
  needs_review: "Needs review",
  draft: "Draft",
  rejected: "Rejected",
  confirmed: "Confirmed",
  duplicate: "Duplicate",
  active: "Active",
  inactive: "Inactive",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = status.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        statusStyles[key] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {statusLabels[key] ?? status}
    </span>
  );
}
