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
  className?: string;
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
  className,
}: Props) {
  const shown = value ?? (amountKurus !== undefined ? format(amountKurus) : "—");

  const body = (
    <>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className="size-4" />}
        {label}
      </div>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums",
          toneClass(tone),
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
    "rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]",
    href && "block transition-colors hover:border-primary/40 hover:bg-muted/30",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}
