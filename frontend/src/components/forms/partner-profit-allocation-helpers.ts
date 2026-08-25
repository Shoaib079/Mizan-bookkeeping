/** Pure helpers for partner profit allocation form. */

import { formatTrDate, formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";

import type { PartnerProfitPayload } from "@/components/forms/partner-profit-allocation-types";

export function buildPartnerProfitPayload(opts: {
  amountText: string;
  periodFromText: string;
  periodToText: string;
}): PartnerProfitPayload | "incomplete_period" | null {
  const profitKurus = parseTryToKurus(opts.amountText);
  const periodFrom = parseTrDate(opts.periodFromText);
  const periodTo = parseTrDate(opts.periodToText);
  const payload: PartnerProfitPayload = {};
  if (profitKurus !== null && profitKurus > 0) {
    payload.profit_kurus = profitKurus;
  }
  if (periodFrom && periodTo) {
    payload.period_from = periodFrom;
    payload.period_to = periodTo;
  } else if (periodFrom || periodTo) {
    return "incomplete_period";
  }
  if (!payload.profit_kurus && !(payload.period_from && payload.period_to)) {
    return null;
  }
  return payload;
}

export function partnerProfitSourceBanner(
  payload: PartnerProfitPayload,
  previewTotal: number,
): string {
  if (payload.profit_kurus != null) {
    const periodNote =
      payload.period_from && payload.period_to
        ? ` Period ${formatTrDate(payload.period_from)}–${formatTrDate(payload.period_to)} only sets which drawings to net — it does not change this amount.`
        : "";
    return `Distributing your amount of ${formatTry(payload.profit_kurus)}.${periodNote}`;
  }
  return `Distributing the period’s net profit of ${formatTry(previewTotal)} (no amount typed).`;
}
