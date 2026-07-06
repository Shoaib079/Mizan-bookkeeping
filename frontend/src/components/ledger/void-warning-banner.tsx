"use client";

/** Prominent warning shown before voiding a posted record. */

export function VoidWarningBanner() {
  return (
    <div
      className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
      role="alert"
    >
      <p className="font-medium">This cannot be undone.</p>
      <p className="mt-1 text-xs text-warning/90">
        Voiding posts a reversal in the ledger. The original stays visible with a
        strikethrough when you show history.
      </p>
    </div>
  );
}
