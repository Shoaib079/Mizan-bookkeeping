"use client";

/** Shared list pager (audit A3) — "1–50 of 94" with Prev/Next. */

import { Button } from "@/components/ui/button";

type Props = {
  offset: number;
  pageSize: number;
  total: number;
  disabled?: boolean;
  onOffsetChange: (offset: number) => void;
};

export function TablePager({
  offset,
  pageSize,
  total,
  disabled = false,
  onOffsetChange,
}: Props) {
  if (total <= pageSize && offset === 0) return null;

  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + pageSize, total);
  const canPrev = offset > 0;
  const canNext = offset + pageSize < total;

  return (
    <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
      <span className="tabular-nums">
        {start}–{end} of {total}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-8 px-3"
          disabled={disabled || !canPrev}
          onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
        >
          ‹ Prev
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-8 px-3"
          disabled={disabled || !canNext}
          onClick={() => onOffsetChange(offset + pageSize)}
        >
          Next ›
        </Button>
      </div>
    </div>
  );
}
