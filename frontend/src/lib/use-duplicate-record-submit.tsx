"use client";

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { isDuplicateRecordError } from "@/lib/duplicate-record";

export function useDuplicateRecordSubmit() {
  const [open, setOpen] = useState(false);
  const [apiMessage, setApiMessage] = useState("");
  const resolverRef = useRef<((acknowledged: boolean) => void) | null>(null);

  const requestDuplicateAck = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setApiMessage(message);
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const cancelDuplicate = useCallback(() => {
    setOpen(false);
    resolverRef.current?.(false);
    resolverRef.current = null;
  }, []);

  const confirmDuplicate = useCallback(() => {
    setOpen(false);
    resolverRef.current?.(true);
    resolverRef.current = null;
  }, []);

  const submitWithDuplicateGuard = useCallback(
    async <T,>(
      execute: (acknowledgedDuplicate: boolean) => Promise<T>,
    ): Promise<T> => {
      try {
        return await execute(false);
      } catch (err) {
        if (!isDuplicateRecordError(err)) throw err;
        const acknowledged = await requestDuplicateAck(err.message);
        if (!acknowledged) {
          throw new Error("Duplicate record not saved.");
        }
        return await execute(true);
      }
    },
    [requestDuplicateAck],
  );

  function DuplicateRecordDialog() {
    return (
      <Dialog
        open={open}
        title="Already exists"
        onClose={cancelDuplicate}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{apiMessage}</p>
          <p className="text-sm">Record anyway?</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={cancelDuplicate}>
              No
            </Button>
            <Button type="button" onClick={confirmDuplicate}>
              Yes, record anyway
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return { submitWithDuplicateGuard, DuplicateRecordDialog };
}
