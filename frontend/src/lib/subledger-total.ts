/** Pure arithmetic and wording behind the Staff and Partner balance cards. */

/**
 * Net across every person in a subledger.
 *
 * Balances are signed the same way the directory shows them, so amounts owed
 * and advances held cancel rather than being summed as magnitudes — an
 * employee holding an advance genuinely reduces what the business is out of
 * pocket for.
 */
export function sumBalances(balances: Map<string, number>): number {
  let total = 0;
  for (const value of balances.values()) total += value;
  return total;
}

/** "7 employees" / "1 partner" — so a card can say what its total covers. */
export function subledgerCountLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
