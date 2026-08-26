"use client";

/** Tinted Lucide icon square — accepted-live baseline (owner 2026-08-22).
 * Paints on v1 and v2; tokens live on :root. */

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type IconTint = "mint" | "sky" | "sand" | "blush" | "gray";
export type IconStroke = "green" | "blue" | "amber" | "red" | "gray";

const TINT_CLASS: Record<IconTint, string> = {
  mint: "bg-[var(--tint-mint)]",
  sky: "bg-[var(--tint-sky)]",
  sand: "bg-[var(--tint-sand)]",
  blush: "bg-[var(--tint-blush)]",
  gray: "bg-[var(--tint-gray)]",
};

const STROKE_CLASS: Record<IconStroke, string> = {
  green: "text-[var(--icon-green)]",
  blue: "text-[var(--icon-blue)]",
  amber: "text-[var(--icon-amber)]",
  red: "text-[var(--icon-red)]",
  gray: "text-[var(--icon-gray)]",
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
  /** lg = 44×44 (KPI / sticker / settings); xl = 48×48 (Record desk); sm = dense list rows */
  size?: "lg" | "xl" | "sm";
  className?: string;
}) {
  return (
    <span
      data-icon-square
      data-tint={tint}
      data-stroke={stroke}
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        size === "xl" && "size-12 rounded-[14px]",
        size === "lg" && "size-11 rounded-[12px]",
        size === "sm" && "size-9 rounded-[10px]",
        TINT_CLASS[tint],
        STROKE_CLASS[stroke],
        className,
      )}
    >
      <Icon
        className={
          size === "xl" ? "size-6" : size === "lg" ? "size-5" : "size-4"
        }
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
    return {
      tint: "mint",
      stroke: "green",
      accent: "var(--accent-bar-green)",
    };
  }
  if (tone === "bad") {
    return {
      tint: "blush",
      stroke: "red",
      accent: "var(--accent-bar-red)",
    };
  }
  return {
    tint: "sky",
    stroke: "blue",
    accent: "var(--accent-bar-blue)",
  };
}

/** Map balance sticker direction → locked icon look. */
export function stickerDirectionLook(
  direction: "company_owes" | "they_owe" | "settled",
): { tint: IconTint; stroke: IconStroke; accent: string } {
  if (direction === "company_owes") {
    return {
      tint: "mint",
      stroke: "green",
      accent: "var(--accent-bar-green)",
    };
  }
  if (direction === "they_owe") {
    return {
      tint: "blush",
      stroke: "red",
      accent: "var(--accent-bar-red)",
    };
  }
  return {
    tint: "gray",
    stroke: "gray",
    accent: "var(--accent-bar-gray)",
  };
}
