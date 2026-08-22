import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  posted: "bg-chip-in-soft text-chip-in",
  needs_review: "bg-chip-attention-soft text-chip-attention",
  draft: "bg-muted text-muted-foreground",
  rejected: "bg-chip-out-soft text-chip-out",
  confirmed: "bg-chip-neutral-soft text-chip-neutral",
  duplicate: "bg-chip-attention-soft text-chip-attention",
  active: "bg-chip-in-soft text-chip-in",
  inactive: "bg-muted text-muted-foreground",
  open: "bg-chip-neutral-soft text-chip-neutral",
  closed: "bg-muted text-muted-foreground",
  imported: "bg-muted text-muted-foreground",
  classified: "bg-chip-neutral-soft text-chip-neutral",
  linked: "bg-chip-in-soft text-chip-in",
  voided: "bg-muted text-muted-foreground line-through",
  // A record that was corrected: the superseded original is kept for the
  // audit trail but no longer counts. Struck through like a void, because
  // that is what it is to a reader — replaced, not pending.
  amended: "bg-muted text-muted-foreground line-through",
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
  open: "Open",
  closed: "Closed",
  imported: "Imported",
  classified: "Classified",
  linked: "Linked",
  voided: "Voided",
  amended: "Amended",
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
