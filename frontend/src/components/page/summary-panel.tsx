"use client";

/** The labelled-lines-with-a-total panel (DESIGN_ARCHETYPES §"shared pieces").
 *
 * Generalized from the partner Profit / Cash stickers so every detail page
 * explains its headline number the same way: a few contributing lines, a rule,
 * then the figure that matters. */

import { formatTry } from "@/lib/money";
import { cn } from "@/lib/utils";

export type SummaryLine = {
  label: string;
  /** Small grey qualifier after the label ("3 periods", "since 01.03"). */
  hint?: string;
  amountKurus: number;
  /** Render as a deduction: shown negative-signed regardless of stored sign. */
  negative?: boolean;
  /** Colour the figure by meaning rather than sign. */
  tone?: "default" | "good" | "bad";
  /** Skip the line entirely when the amount is zero. */
  hideWhenZero?: boolean;
};

function toneClass(tone: SummaryLine["tone"]): string | undefined {
  if (tone === "good") return "text-success";
  if (tone === "bad") return "text-destructive";
  return undefined;
}

function Row({ line, total = false }: { line: SummaryLine; total?: boolean }) {
  const magnitude = Math.abs(line.amountKurus);
  const text = line.negative
    ? `−${formatTry(magnitude)}`
    : formatTry(line.amountKurus);

  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 border-t border-border py-1.5 first:border-t-0",
        total && "mt-1 border-t-2 pt-2.5",
      )}
    >
      <span
        className={cn(
          "text-sm text-muted-foreground",
          total && "font-medium text-foreground",
        )}
      >
        {line.label}
        {line.hint && (
          <span className="ml-1 text-xs text-muted-foreground/70">
            · {line.hint}
          </span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          total ? "text-base font-semibold" : "text-sm",
          toneClass(line.tone),
        )}
      >
        {text}
      </span>
    </div>
  );
}

type Props = {
  title: string;
  /** Blue-tinted heading — use for the panel this page is really about. */
  accent?: boolean;
  lines: SummaryLine[];
  /** The bottom line, ruled off above. */
  total?: SummaryLine;
  /** Shown instead of the lines when there is no history yet. */
  emptyMessage?: string;
  footnote?: string;
  className?: string;
};

export function SummaryPanel({
  title,
  accent = false,
  lines,
  total,
  emptyMessage,
  footnote,
  className,
}: Props) {
  const visible = lines.filter(
    (line) => !(line.hideWhenZero && line.amountKurus === 0),
  );
  const isEmpty = visible.length === 0 && !total;

  return (
    <section
      className={cn(
        "min-w-[16rem] flex-1 overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]",
        accent ? "border-primary/30" : "border-border",
        className,
      )}
    >
      <h3
        className={cn(
          "px-4 py-2 text-sm font-medium",
          accent
            ? "bg-primary/10 text-primary"
            : "bg-muted/50 text-muted-foreground",
        )}
      >
        {title}
      </h3>
      <div className="px-4 py-3">
        {isEmpty && emptyMessage ? (
          <p className="py-1 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <>
            {visible.map((line) => (
              <Row key={line.label} line={line} />
            ))}
            {total && <Row line={total} total />}
          </>
        )}
        {footnote && (
          <p className="mt-2 text-xs text-muted-foreground">{footnote}</p>
        )}
      </div>
    </section>
  );
}

/** The one number a page exists to answer. */
export function HeadlineFigure({
  label,
  amountKurus,
  caption,
  tone = "default",
  className,
}: {
  label: string;
  amountKurus: number;
  caption?: string;
  tone?: "default" | "good" | "bad";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-[13rem] flex-1 rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          toneClass(tone),
        )}
      >
        {formatTry(amountKurus)}
      </p>
      {caption && (
        <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>
      )}
    </div>
  );
}
