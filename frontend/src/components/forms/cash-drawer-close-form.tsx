"use client";

/** Cash drawer EOD close with over/short — Phase 9 Slice 4. */

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import type {
  CashDrawerSessionRead,
  MoneyAccountLeaf,
} from "@/lib/banking-types";
import { cn } from "@/lib/utils";
import { useEntity } from "@/lib/entity-context";
import { formatTry, parseTryToKurus } from "@/lib/money";

type Props = {
  open: boolean;
  onClose: () => void;
  session: CashDrawerSessionRead;
  onClosed?: () => void;
};

export function CashDrawerCloseForm({
  open,
  onClose,
  session,
  onClosed,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [countedText, setCountedText] = useState("");
  const [description, setDescription] = useState("Cash drawer EOD close");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expectedKurus, setExpectedKurus] = useState<number | null>(null);

  // The session only records expected_balance at close time, so for an open
  // drawer read the same GL balance the backend will compare against.
  useEffect(() => {
    if (!open || !entityId) return;
    let cancelled = false;
    void apiFetch<{ items: MoneyAccountLeaf[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
    )
      .then((res) => {
        if (cancelled) return;
        const account = res.items.find((a) => a.id === session.money_account_id);
        setExpectedKurus(account?.balance_kurus ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, entityId, session.money_account_id]);

  const countedPreviewKurus = parseTryToKurus(countedText);
  const overShortKurus =
    expectedKurus !== null && countedPreviewKurus !== null
      ? countedPreviewKurus - expectedKurus
      : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const countedKurus = parseTryToKurus(countedText);
    if (countedKurus === null || countedKurus < 0) {
      setError("Enter a valid counted balance.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/cash/drawer-sessions/${session.id}/close`,
        {
          method: "POST",
        idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            counted_balance_kurus: countedKurus,
            actor_id: actorId,
            description,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      onClosed?.();
      toast("Drawer closed");
      onClose();
      setCountedText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Close failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Close cash drawer" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        {session.expected_balance_kurus !== null && (
          <p className="text-sm text-muted-foreground">
            Expected balance: {formatTry(session.expected_balance_kurus)}
          </p>
        )}
        {expectedKurus !== null && (
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm text-muted-foreground">
                Should be in the drawer
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {formatTry(expectedKurus)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Cash sales and money in, less expenses and money out, as recorded.
            </p>
          </div>
        )}
        <div>
          <Label htmlFor="counted">Counted balance (TRY)</Label>
          <MoneyInput
            id="counted"
            placeholder="2.350,00"
            value={countedText}
            onChange={setCountedText}
            required
          />
        </div>
        {overShortKurus !== null && (
          <div
            className={cn(
              "flex items-baseline justify-between gap-4 rounded-md px-3 py-2 text-sm",
              overShortKurus === 0 && "bg-success/10 text-success",
              overShortKurus > 0 && "bg-warning/10 text-warning",
              overShortKurus < 0 && "bg-destructive/10 text-destructive",
            )}
          >
            <span>
              {overShortKurus === 0
                ? "Drawer matches the books"
                : overShortKurus > 0
                  ? "Over — more cash than expected"
                  : "Short — less cash than expected"}
            </span>
            <span className="font-semibold tabular-nums">
              {overShortKurus > 0 ? "+" : ""}
              {formatTry(overShortKurus)}
            </span>
          </div>
        )}
        <div>
          <Label htmlFor="close-desc">Description</Label>
          <Input
            id="close-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Over/short posts to account 5400 automatically.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Closing…" : "Close drawer"}
        </Button>
      </form>
    </Dialog>
  );
}
