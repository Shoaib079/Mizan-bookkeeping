"use client";

/** One figure with its context (DESIGN_ARCHETYPES §"shared pieces").
 *
 * The dashboard had three different card shapes for the same job — a linked
 * "This period" card, a plain sales/expenses pair, and the "Right now" tiles —
 * each with its own padding, radius and heading treatment. This is the one
 * shape: a label, the number, and optionally the lines that make it up.
 *
 * Distinct from `HeadlineFigure`, which answers "what is this page about";
 * a `StatCard` is one of several on a page and can be a link to the page that
 * explains it. */

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { formatTry } from "@/lib/money";
import type { AmountFormatter } from "@/components/page/summary-panel";
import {
  IconSquare,
  toneToIconLook,
  type IconStroke,
  type IconTint,
} from "@/components/ui/icon-square";
import { MeaningCardAccentBar } from "@/components/ui/meaning-card";
import { TrendPill } from "@/components/ui/trend-pill";
import { cn } from "@/lib/utils";

export type StatLine = {
  label: string;
  amountKurus: number;
  tone?: "default" | "good" | "bad";
};

function toneClass(tone: StatLine["tone"]): string | undefined {
  if (tone === "good") return "text-success";
  if (tone === "bad") return "text-destructive";
  return undefined;
}

function accentForTint(tint: IconTint, fallback: string): string {
  if (tint === "mint") return "var(--accent-bar-green, #4E9E77)";
  if (tint === "blush") return "var(--accent-bar-red, #C05B62)";
  if (tint === "gray") return "var(--accent-bar-gray, #A7B0BD)";
  return fallback;
}

type Props = {
  label: string;
  icon?: LucideIcon;
  amountKurus?: number;
  /** Pre-formatted value when the figure isn't lira (FX, counts). */
  value?: string;
  format?: AmountFormatter;
  tone?: "default" | "good" | "bad";
  caption?: string;
  /** Breakdown under a rule — what the headline is made of. */
  lines?: StatLine[];
  /** Makes the whole card a link to the page that explains the number. */
  href?: string;
  /** Optional trend pill — e.g. "+12%". */
  trend?: { value: string; direction?: "up" | "down" | "flat" };
  className?: string;
  /** Override the figure colour (e.g. text-primary on Card sales). */
  figureClassName?: string;
  /** Override IconSquare tint/stroke when tone alone is not enough. */
  iconTint?: IconTint;
  iconStroke?: IconStroke;
};

export function StatCard({
  label,
  icon: Icon,
  amountKurus,
  value,
  format = formatTry,
  tone = "default",
  caption,
  lines,
  href,
  trend,
  className,
  figureClassName,
  iconTint,
  iconStroke,
}: Props) {
  const shown = value ?? (amountKurus !== undefined ? format(amountKurus) : "—");
  const look = toneToIconLook(tone);
  const tint = iconTint ?? look.tint;
  const stroke = iconStroke ?? look.stroke;
  const accent = accentForTint(tint, look.accent);

  const body = (
    <>
      <MeaningCardAccentBar />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <IconSquare icon={Icon} tint={tint} stroke={stroke} size="lg" />
          )}
          <span data-stat-label className="text-sm text-muted-foreground">
            {label}
          </span>
        </div>
        {trend && (
          <TrendPill value={trend.value} direction={trend.direction ?? "up"} />
        )}
      </div>
      <p
        data-stat-figure
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums",
          toneClass(tone),
          figureClassName,
        )}
      >
        {shown}
      </p>
      {caption && (
        <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>
      )}
      {lines && lines.length > 0 && (
        <div className="mt-3 border-t border-border pt-3 text-sm">
          {lines.map((line) => (
            <div key={line.label} className="flex justify-between gap-3 py-0.5">
              <span className="text-muted-foreground">{line.label}</span>
              <span className={cn("tabular-nums", toneClass(line.tone))}>
                {format(line.amountKurus)}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const shell = cn(
    "relative rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-[var(--shadow-card)]",
    href && "block transition-colors hover:border-primary/40 hover:bg-muted/30",
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        data-meaning-card
        data-tone={tone}
        className={shell}
        style={{ ["--accent-bar" as string]: accent }}
      >
        {body}
      </Link>
    );
  }
  return (
    <div
      data-meaning-card
      data-tone={tone}
      className={shell}
      style={{ ["--accent-bar" as string]: accent }}
    >
      {body}
    </div>
  );
}
