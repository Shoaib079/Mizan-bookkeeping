"use client";

import { FormEvent, useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { isPeriodLockError } from "@/lib/period-unlock";

export function usePeriodUnlockSubmit() {
  const [open, setOpen] = useState(false);
  const [apiMessage, setApiMessage] = useState("");
  const [reasonText, setReasonText] = useState("");
  const resolverRef = useRef<((reason: string | null) => void) | null>(null);

  const requestUnlockReason = useCallback((message: string) => {
    return new Promise<string | null>((resolve) => {
      setApiMessage(message);
      setReasonText("");
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const cancelUnlock = useCallback(() => {
    setOpen(false);
    resolverRef.current?.(null);
    resolverRef.current = null;
  }, []);

  const confirmUnlock = useCallback(() => {
    const trimmed = reasonText.trim();
    if (!trimmed) return;
    setOpen(false);
    resolverRef.current?.(trimmed);
    resolverRef.current = null;
  }, [reasonText]);

  const submitWithPeriodUnlock = useCallback(
    async <T,>(
      execute: (periodUnlockReason?: string) => Promise<T>,
    ): Promise<T> => {
      try {
        return await execute();
      } catch (err) {
        if (!isPeriodLockError(err)) throw err;
        const reason = await requestUnlockReason(
          err instanceof Error
            ? err.message
            : "This date falls in a closed period.",
        );
        if (!reason) {
          throw new Error("Period unlock cancelled.");
        }
        return await execute(reason);
      }
    },
    [requestUnlockReason],
  );

  function onUnlockSubmit(event: FormEvent) {
    event.preventDefault();
    confirmUnlock();
  }

  function PeriodUnlockDialog() {
    return (
      <Dialog
        open={open}
        title="Closed period — owner unlock"
        onClose={cancelUnlock}
      >
        <form onSubmit={onUnlockSubmit} className="space-y-3">
          <p className="text-sm text-muted-foreground">{apiMessage}</p>
          <p className="text-sm">
            As the owner, provide a reason to write in this closed period. This
            is recorded in the audit trail.
          </p>
          <div>
            <Label htmlFor="period-unlock-reason">Unlock reason</Label>
            <Input
              id="period-unlock-reason"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Why are you changing a closed period?"
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={cancelUnlock}>
              Cancel
            </Button>
            <Button type="submit" disabled={!reasonText.trim()}>
              Retry with unlock
            </Button>
          </div>
        </form>
      </Dialog>
    );
  }

  return { submitWithPeriodUnlock, PeriodUnlockDialog };
}
