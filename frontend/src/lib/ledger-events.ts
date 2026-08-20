/** App-wide event fired after any money post/void/correct succeeds.
 * React Query listens and invalidates all cached data. */

export const LEDGER_CHANGED_EVENT = "mizan:ledger-changed";

export function emitLedgerChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LEDGER_CHANGED_EVENT));
}
