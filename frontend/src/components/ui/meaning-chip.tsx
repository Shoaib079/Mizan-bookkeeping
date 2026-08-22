"use client";

/** Semantic colour chip — money in / out / attention / neutral (balance sticker semantics). */

import { cn } from "@/lib/utils";

export type MeaningChipTone = "in" | "out" | "attention" | "neutral";

const toneClasses: Record<MeaningChipTone, string> = {
  in: "border-chip-in/25 bg-chip-in-soft text-chip-in",
  out: "border-chip-out/25 bg-chip-out-soft text-chip-out",
  attention: "border-chip-attention/25 bg-chip-attention-soft text-chip-attention",
  neutral: "border-chip-neutral/25 bg-chip-neutral-soft text-chip-neutral",
};

export function MeaningChip({
  tone,
  children,
  className,
}: {
  tone: MeaningChipTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      data-meaning-chip={tone}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
