/** App-wide event fired after any void/correction posts (phase 4/6).
 * React Query listens and invalidates all cached data. */

export const LEDGER_CHANGED_EVENT = "mizan:ledger-changed";

export function emitLedgerChanged(): void {
  window.dispatchEvent(new Event(LEDGER_CHANGED_EVENT));
}
