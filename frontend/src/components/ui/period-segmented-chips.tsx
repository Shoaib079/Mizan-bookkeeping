"use client";

/** Dashboard period presets — Today / This week / This month. */

import { SegmentedControl } from "@/components/ui/segmented-control";

export type PeriodPreset = "today" | "week" | "month";

const PERIOD_OPTIONS = [
  { value: "today" as const, label: "Today" },
  { value: "week" as const, label: "This week" },
  { value: "month" as const, label: "This month" },
];

export function PeriodSegmentedChips({
  value,
  onChange,
  className,
}: {
  value: PeriodPreset;
  onChange: (next: PeriodPreset) => void;
  className?: string;
}) {
  return (
    <SegmentedControl
      options={PERIOD_OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Period"
      className={className}
    />
  );
}
