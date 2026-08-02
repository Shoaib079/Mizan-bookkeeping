/** TRY note/coin denominations for cash drawer counting (kuruş). */

export type DenominationLine = {
  denomination_kurus: number;
  quantity: number;
};

export const TRY_DENOMINATIONS: readonly {
  denomination_kurus: number;
  label: string;
}[] = [
  { denomination_kurus: 20_000, label: "200 ₺" },
  { denomination_kurus: 10_000, label: "100 ₺" },
  { denomination_kurus: 5_000, label: "50 ₺" },
  { denomination_kurus: 2_000, label: "20 ₺" },
  { denomination_kurus: 1_000, label: "10 ₺" },
  { denomination_kurus: 500, label: "5 ₺" },
  { denomination_kurus: 100, label: "1 ₺" },
  { denomination_kurus: 50, label: "50 kr" },
  { denomination_kurus: 25, label: "25 kr" },
  { denomination_kurus: 10, label: "10 kr" },
  { denomination_kurus: 5, label: "5 kr" },
] as const;

export function emptyDenominationQuantities(): Record<number, number> {
  return Object.fromEntries(
    TRY_DENOMINATIONS.map((d) => [d.denomination_kurus, 0]),
  );
}

export function denominationLinesFromQuantities(
  quantities: Record<number, number>,
): DenominationLine[] {
  return TRY_DENOMINATIONS.map((d) => ({
    denomination_kurus: d.denomination_kurus,
    quantity: Math.max(0, Math.floor(quantities[d.denomination_kurus] ?? 0)),
  })).filter((line) => line.quantity > 0);
}

export function denominationTotalKurus(lines: DenominationLine[]): number {
  return lines.reduce(
    (sum, line) => sum + line.denomination_kurus * line.quantity,
    0,
  );
}
