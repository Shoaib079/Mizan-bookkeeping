/** Which way a subledger balance points, in words. One rule, one place.
 *
 * Every subledger in this app answers the same question — does this person owe
 * the business, or does the business owe them — and the sign is the answer.
 * Partners already read that way. Staff did not: its headline was
 *
 *     netToPayMinor = Math.max(0, salaryOwed - advanceHeld)
 *
 * and that clamp does not merely round a negative to zero, it deletes the
 * direction. An employee holding 1.000 of the owner's money with nothing owed
 * showed a headline of 0,00 — the money he owed back appeared as a number
 * nowhere on the page.
 *
 * Kept here rather than beside either page because "the same wording in two
 * places" is how the edit and void rules drifted twice, in exactly the way
 * that cost the most to find.
 */

/** Positive = the business owes them. Negative = they owe the business. */
export function balanceHeading(balanceMinor: number, counterparty: string): string {
  if (balanceMinor > 0) return `You owe ${counterparty}`;
  if (balanceMinor < 0) return `${capitalise(counterparty)} owes you`;
  return "Settled";
}

/** The line under the figure — what the reader should do about it. */
export function balanceCaption(balanceMinor: number): string {
  if (balanceMinor > 0) return "Pay this to settle";
  if (balanceMinor < 0) return "This comes back to you";
  return "Nothing owed either way";
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
