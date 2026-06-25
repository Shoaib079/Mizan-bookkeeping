"use client";

/** One-time “Resume draft?” prompt — DESIGN_SYSTEM.md §10, Phase 10 Slice 7. */

import { Button } from "@/components/ui/button";

type Props = {
  onResume: () => void;
  onDismiss: () => void;
};

export function ResumeDraftBanner({ onResume, onDismiss }: Props) {
  return (
    <div
      className="mb-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm"
      role="status"
    >
      <p>You have a saved draft. Resume it?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" onClick={onResume}>
          Resume draft
        </Button>
        <Button type="button" variant="ghost" onClick={onDismiss}>
          Start fresh
        </Button>
      </div>
    </div>
  );
}
