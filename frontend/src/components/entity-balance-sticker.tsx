"use client";

/** Compact balance sticker for partner / staff / supplier detail headers.
 *
 * Colour encodes direction (owner 2026-08-20):
 * - green = company owes them
 * - red = they owe the company
 * - muted = settled (zero)
 *
 * One component — pages pass the signed balance and label; they do not paint
 * their own card. Under data-theme=v2: white + hairline + muted left bar +
 * tinted icon square + ink absolute figure (locked owner spec). */

import { ArrowDown, ArrowUp, CheckCircle } from "lucide-react";

import { formatTry } from "@/lib/money";
import type { AmountFormatter } from "@/components/page/summary-panel";
import {
  IconSquare,
  stickerDirectionLook,
} from "@/components/ui/icon-square";
import { cn } from "@/lib/utils";

export type BalanceStickerDirection = "company_owes" | "they_owe" | "settled";

/** Positive = company owes them; negative = they owe the company; 0 = settled. */
export function balanceStickerDirection(
  signedBalanceMinor: number,
): BalanceStickerDirection {
  if (signedBalanceMinor > 0) return "company_owes";
  if (signedBalanceMinor < 0) return "they_owe";
  return "settled";
}

type Props = {
  label: string;
  /** Small secondary line under the heading (e.g. "Current balance"). */
  caption?: string;
  /** Signed balance — magnitude is shown; sign picks colour. */
  signedBalanceMinor: number;
  format?: AmountFormatter;
  /** Compact muted sub-lines (capital, staff breakdown, invoice count). */
  details?: React.ReactNode;
  className?: string;
};

function stickerIcon(direction: BalanceStickerDirection) {
  if (direction === "company_owes") return ArrowUp;
  if (direction === "they_owe") return ArrowDown;
  return CheckCircle;
}

export function EntityBalanceSticker({
  label,
  caption,
  signedBalanceMinor,
  format = formatTry,
  details,
  className,
}: Props) {
  const direction = balanceStickerDirection(signedBalanceMinor);
  const look = stickerDirectionLook(direction);
  const Icon = stickerIcon(direction);

  return (
    <aside
      data-testid="entity-balance-sticker"
      data-direction={direction}
      data-meaning-card
      className={cn(
        "relative w-full max-w-full shrink-0 overflow-hidden rounded-[var(--radius-card)] border px-3 py-2 sm:ml-auto sm:max-w-[16rem]",
        direction === "company_owes" &&
          "border-chip-in/25 bg-chip-in-soft text-chip-in",
        direction === "they_owe" &&
          "border-chip-out/25 bg-chip-out-soft text-chip-out",
        direction === "settled" &&
          "border-border bg-muted text-muted-foreground",
        className,
      )}
      style={{ ["--accent-bar" as string]: look.accent }}
    >
      <span data-accent-bar aria-hidden className="hidden" />
      <div className="flex items-start gap-2.5">
        <IconSquare icon={Icon} tint={look.tint} stroke={look.stroke} size="lg" />
        <div className="min-w-0 flex-1">
          <p
            data-sticker-heading
            className="text-xs font-medium leading-snug opacity-90"
          >
            {label}
          </p>
          {caption ? (
            <p
              data-sticker-caption
              className="text-[0.65rem] leading-snug opacity-70"
            >
              {caption}
            </p>
          ) : null}
          <p
            data-sticker-figure
            className="mt-0.5 text-lg font-semibold tabular-nums leading-tight"
          >
            {format(Math.abs(signedBalanceMinor))}
          </p>
        </div>
      </div>
      {details ? (
        <div className="mt-1.5 space-y-0.5 border-t border-border/60 pt-1.5 text-xs leading-snug text-muted-foreground">
          {details}
        </div>
      ) : null}
    </aside>
  );
}
