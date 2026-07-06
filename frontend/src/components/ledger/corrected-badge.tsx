export function EditedBadge() {
  return (
    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Edited
    </span>
  );
}

/** @deprecated Use EditedBadge */
export const CorrectedBadge = EditedBadge;
