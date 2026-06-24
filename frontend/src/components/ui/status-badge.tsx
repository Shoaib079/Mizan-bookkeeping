import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  posted: "bg-success/10 text-success",
  needs_review: "bg-warning/10 text-warning",
  draft: "bg-muted text-muted-foreground",
  rejected: "bg-destructive/10 text-destructive",
};

const statusLabels: Record<string, string> = {
  posted: "Posted",
  needs_review: "Needs review",
  draft: "Draft",
  rejected: "Rejected",
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
