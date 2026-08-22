"use client";

import { DeskModeButton } from "@/components/record/record-desk-buttons";
import { RECORD_ACTIONS } from "@/lib/record-actions";

const PREVIEW_DESK_IDS = ["expense", "sales", "supplier", "countCash"] as const;

export function PreviewRecordScreen({
  onPreviewOnly,
}: {
  onPreviewOnly: (label: string) => void;
}) {
  const actions = PREVIEW_DESK_IDS.map((id) =>
    RECORD_ACTIONS.find((action) => action.id === id),
  ).filter(Boolean);

  return (
    <div className="space-y-4" data-preview-screen="record">
      <h1 className="text-lg font-semibold">Record</h1>
      <p className="text-sm text-muted-foreground">
        Desk chips are inert in preview — tap shows a hint, never posts.
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {actions.map((action) => (
          <DeskModeButton
            key={action!.id}
            action={action!}
            label={action!.label}
            active={action!.id === "expense"}
            mobilePill
            onSelect={() => onPreviewOnly(action!.label)}
          />
        ))}
      </div>
    </div>
  );
}
