"use client";

import { Button } from "@/components/ui/button";

type Props = {
  hiddenCount: number;
  showHistory: boolean;
  onToggle: (next: boolean) => void;
};

export function LedgerHistoryToggle({
  hiddenCount,
  showHistory,
  onToggle,
}: Props) {
  if (hiddenCount <= 0) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-8 px-2 text-xs text-muted-foreground"
      onClick={() => onToggle(!showHistory)}
    >
      {showHistory
        ? "Hide correction history"
        : `Show correction history (${hiddenCount})`}
    </Button>
  );
}
