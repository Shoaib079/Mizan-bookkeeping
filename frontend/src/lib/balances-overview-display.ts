/** Pure display rules for dashboard / Balances hub stickers.
 *
 * Direction colour (accepted-live 2026-08-23): you-owe green, they-owe red,
 * settled muted, FX/neutral ink. Figures are always absolute — never a minus.
 */

export type OverviewFigureTone = "you_owe" | "they_owe" | "settled" | "ink";

export const OVERVIEW_FIGURE_CLASS: Record<OverviewFigureTone, string> = {
  you_owe: "text-success",
  they_owe: "text-destructive",
  settled: "text-muted-foreground",
  ink: "text-ink-strong",
};

export type OverviewFigureDisplay = {
  /** Absolute kuruş (or 0) for TRY formatting — never negative. */
  amountKurus: number;
  tone: OverviewFigureTone;
  hint: string;
};

/** Payables: positive = you owe suppliers; negative = net advances. */
export function payablesOverviewDisplay(totalKurus: number): OverviewFigureDisplay {
  if (totalKurus === 0) {
    return {
      amountKurus: 0,
      tone: "settled",
      hint: "Nothing outstanding",
    };
  }
  if (totalKurus > 0) {
    return {
      amountKurus: totalKurus,
      tone: "you_owe",
      hint: "Total owed to suppliers",
    };
  }
  return {
    amountKurus: Math.abs(totalKurus),
    tone: "they_owe",
    hint: "Net advances — suppliers owe you",
  };
}

/** Receivables: positive = they owe you. */
export function receivablesOverviewDisplay(
  totalKurus: number,
): OverviewFigureDisplay {
  if (totalKurus === 0) {
    return {
      amountKurus: 0,
      tone: "settled",
      hint: "Nothing outstanding",
    };
  }
  if (totalKurus > 0) {
    return {
      amountKurus: totalKurus,
      tone: "they_owe",
      hint: "Total owed to you",
    };
  }
  return {
    amountKurus: Math.abs(totalKurus),
    tone: "you_owe",
    hint: "Net credit — you owe customers",
  };
}

/** Partner: positive = restaurant owes partner (you-owe). */
export function partnerOverviewDisplay(
  totalKurus: number,
  existingHint: string,
): OverviewFigureDisplay {
  if (totalKurus === 0) {
    return {
      amountKurus: 0,
      tone: "settled",
      hint: "Nothing outstanding",
    };
  }
  if (totalKurus > 0) {
    return {
      amountKurus: totalKurus,
      tone: "you_owe",
      hint: existingHint,
    };
  }
  return {
    amountKurus: Math.abs(totalKurus),
    tone: "they_owe",
    hint: existingHint,
  };
}

/** Staff TRY net: positive = owed to employees; zero = settled; negative = advances. */
export function staffOverviewTone(netSign: number): OverviewFigureTone {
  if (netSign === 0) return "settled";
  if (netSign > 0) return "you_owe";
  return "they_owe";
}

export function staffOverviewHint(
  netSign: number,
  baseHint: string,
): string {
  if (netSign === 0) return "Nothing outstanding";
  return baseHint;
}
