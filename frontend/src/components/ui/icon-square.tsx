"use client";

/** Locked icon square — pale tinted bg + Lucide line icon (v2 spec §2–5). */

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type IconTint = "mint" | "sky" | "sand" | "blush" | "gray";
export type IconStroke = "green" | "blue" | "amber" | "red" | "gray";

const TINT_CLASS: Record<IconTint, string> = {
  mint: "bg-[var(--tint-mint,#E7F7EE)]",
  sky: "bg-[var(--tint-sky,#E4F2FB)]",
  sand: "bg-[var(--tint-sand,#FBF0E0)]",
  blush: "bg-[var(--tint-blush,#FEECEC)]",
  gray: "bg-[var(--tint-gray,#F1F5F9)]",
};

const STROKE_CLASS: Record<IconStroke, string> = {
  green: "text-[var(--icon-green,#16A34A)]",
  blue: "text-[var(--icon-blue,#2563EB)]",
  amber: "text-[var(--icon-amber,#D97706)]",
  red: "text-[var(--icon-red,#DC2626)]",
  gray: "text-[var(--icon-gray,#64748B)]",
};

export function IconSquare({
  icon: Icon,
  tint,
  stroke,
  size = "lg",
  className,
}: {
  icon: LucideIcon;
  tint: IconTint;
  stroke: IconStroke;
  /** lg = 44×44 (KPI / sticker / settings); sm = dense list rows */
  size?: "lg" | "sm";
  className?: string;
}) {
  return (
    <span
      data-icon-square
      data-tint={tint}
      data-stroke={stroke}
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        size === "lg" ? "size-11 rounded-[12px]" : "size-9 rounded-[10px]",
        TINT_CLASS[tint],
        STROKE_CLASS[stroke],
        className,
      )}
    >
      <Icon
        className={size === "lg" ? "size-5" : "size-4"}
        strokeWidth={2}
        fill="none"
        aria-hidden
      />
    </span>
  );
}

/** Map StatCard tone → locked tint + stroke + accent bar. */
export function toneToIconLook(
  tone: "default" | "good" | "bad" | undefined,
): { tint: IconTint; stroke: IconStroke; accent: string } {
  if (tone === "good") {
    return { tint: "mint", stroke: "green", accent: "var(--accent-bar-green)" };
  }
  if (tone === "bad") {
    return { tint: "blush", stroke: "red", accent: "var(--accent-bar-red)" };
  }
  return { tint: "sky", stroke: "blue", accent: "var(--accent-bar-blue)" };
}

/** Map balance sticker direction → locked icon look. */
export function stickerDirectionLook(
  direction: "company_owes" | "they_owe" | "settled",
): { tint: IconTint; stroke: IconStroke; accent: string } {
  if (direction === "company_owes") {
    return { tint: "mint", stroke: "green", accent: "var(--accent-bar-green)" };
  }
  if (direction === "they_owe") {
    return { tint: "blush", stroke: "red", accent: "var(--accent-bar-red)" };
  }
  return { tint: "gray", stroke: "gray", accent: "var(--accent-bar-gray)" };
}
