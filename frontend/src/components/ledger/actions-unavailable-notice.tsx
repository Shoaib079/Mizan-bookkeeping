"use client";

/** Said out loud when the app could not find out what a row allows.
 *
 * `useEntryActions` withholds every button when its lookup fails, which is the
 * safe direction — better than offering an action that will not work. What it
 * used to do badly was stay quiet about it: a failed request and a backend
 * that refused rendered identically, so a ledger with no Edit and no Void
 * anywhere looked broken with nothing to report and no way to try again.
 *
 * The rows themselves are unaffected and still correct; only the actions are
 * missing. The wording says that, so nobody doubts the figures.
 */

import { Button } from "@/components/ui/button";

type Props = {
  onRetry: () => void;
};

export function ActionsUnavailableNotice({ onRetry }: Props) {
  return (
    <div
      role="alert"
      className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
    >
      <p className="flex-1">
        Couldn&apos;t check which entries you can change, so Edit and Void are
        hidden. The rows below are unaffected.
      </p>
      <Button
        type="button"
        variant="secondary"
        className="h-7 px-2 text-xs"
        onClick={onRetry}
      >
        Try again
      </Button>
    </div>
  );
}
