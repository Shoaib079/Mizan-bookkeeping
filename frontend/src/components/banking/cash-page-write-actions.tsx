"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/** Cash page header write controls — split for file-size ratchet (S3). */
export function cashPageWriteHeader(props: {
  entityId: string | null;
  showOpsWrite: boolean;
  showCountCash: boolean;
  showCloseDay: boolean;
  onMovement: () => void;
  onCountCash: () => void;
  onCloseDay: () => void;
  onAddDrawer: () => void;
}): {
  primaryAction: ReactNode;
  actions: ReactNode;
  overflowActions: { label: string; onSelect: () => void }[];
} {
  const {
    entityId,
    showOpsWrite,
    showCountCash,
    showCloseDay,
    onMovement,
    onCountCash,
    onCloseDay,
    onAddDrawer,
  } = props;
  return {
    primaryAction: showOpsWrite ? (
      <Button type="button" disabled={!entityId} onClick={onMovement}>
        Record movement
      </Button>
    ) : undefined,
    actions: showCountCash ? (
      <Button
        type="button"
        variant="secondary"
        disabled={!entityId}
        onClick={onCountCash}
      >
        Count cash
      </Button>
    ) : undefined,
    overflowActions: [
      ...(showCloseDay
        ? [{ label: "Close day", onSelect: onCloseDay }]
        : []),
      ...(showOpsWrite
        ? [{ label: "Add cash drawer", onSelect: onAddDrawer }]
        : []),
    ],
  };
}
