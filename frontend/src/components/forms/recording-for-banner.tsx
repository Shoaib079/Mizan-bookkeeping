"use client";

/** Shows active restaurant on New-menu entry dialogs — Slice 12.0b. */

import { EntityBadge } from "@/components/layout/entity-badge";
import { useEntity } from "@/lib/entity-context";
import { recordingForLabel } from "@/lib/account-menu-helpers";

export function RecordingForBanner() {
  const { entityId, entities } = useEntity();
  const active = entities.find((entity) => entity.id === entityId);

  if (!entityId || !active) {
    return (
      <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        Select a restaurant before recording.
      </p>
    );
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>{recordingForLabel(active.name)}</span>
      <EntityBadge entityId={active.id} name={active.name} size="sm" />
    </div>
  );
}
