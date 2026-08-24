/** Line draft + rate/total display helpers for GroupSaleForm. */

import { formatFxNative, parseFxNative } from "@/lib/fx-money";
import { parseTryToKurus } from "@/lib/money";

export type GroupSaleLineDraft = {
  key: string;
  group_menu_id: string | null;
  menu_name: string;
  paxText: string;
  /** Either of these, never both — whichever you fill drives the other. */
  rateText: string;
  totalText: string;
};

export type ParsedGroupSaleLine = GroupSaleLineDraft & {
  pax: number | null;
  rate: number | null;
  lineTotalMinor: number | null;
  /** Which field the reader typed — the other is derived and read-only. */
  pricedBy: "total" | "rate" | null;
};

export function newGroupSaleLine(): GroupSaleLineDraft {
  return {
    key: crypto.randomUUID(),
    group_menu_id: null,
    menu_name: "",
    paxText: "",
    rateText: "",
    totalText: "",
  };
}

/** The rate implied by a typed total — rounded, shown for reference. `≈` when
 * it does not divide evenly, because the figure that posts is the total. */
export function derivedRateText(
  parsed: {
    rate: number | null;
    pax: number | null;
    lineTotalMinor: number | null;
  },
  currency: string,
): string {
  if (parsed?.rate == null) return "";
  const exact =
    parsed.pax != null && parsed.rate * parsed.pax === parsed.lineTotalMinor;
  return `${exact ? "" : "≈ "}${minorToText(parsed.rate, currency)}`;
}

/** The total implied by a typed rate. Always exact — it is pax × rate. */
export function derivedTotalText(
  parsed: { lineTotalMinor: number | null },
  currency: string,
): string {
  if (parsed?.lineTotalMinor == null) return "";
  return minorToText(parsed.lineTotalMinor, currency);
}

export function minorToText(minor: number, currency: string): string {
  if (currency === "TRY") return (minor / 100).toFixed(2).replace(".", ",");
  return formatFxNative(minor, currency).replace(/[^\d,.-]/g, "").trim();
}

export function parseRateMinor(currency: string, text: string): number | null {
  if (currency === "TRY") return parseTryToKurus(text);
  return parseFxNative(text);
}
