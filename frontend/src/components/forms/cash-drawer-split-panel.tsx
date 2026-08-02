"use client";

/** After Close day — send part of the till float to Cash at home / other drawers. */

import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import type { MoneyAccountLeaf } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { todayTrDate } from "@/lib/dates";
import { preferCashHomeDrawerId } from "@/lib/load-money-accounts";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";

type SplitRow = {
  id: string;
  toId: string;
  amountText: string;
};

export type CashDrawerSplitResult = {
  sentKurus: number;
  leftKurus: number | null;
  fromName: string;
  destLabel: string;
};

type Props = {
  fromAccountId: string;
  fromAccountName: string;
  sessionDate: string;
  cashAccounts: MoneyAccountLeaf[];
  /** Leave the float in the counter — no transfer. */
  onKeepHere: () => void;
  /** Transfers posted — finish with summary. */
  onDone: (result: CashDrawerSplitResult) => void;
};

function newRow(toId = ""): SplitRow {
  return {
    id: crypto.randomUUID(),
    toId,
    amountText: "",
  };
}

export function CashDrawerSplitPanel({
  fromAccountId,
  fromAccountName,
  sessionDate,
  cashAccounts,
  onKeepHere,
  onDone,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const destinations = useMemo(
    () => cashAccounts.filter((a) => a.id !== fromAccountId && a.is_active),
    [cashAccounts, fromAccountId],
  );

  const preferredHomeId = useMemo(
    () => preferCashHomeDrawerId(destinations, fromAccountId),
    [destinations, fromAccountId],
  );

  const [rows, setRows] = useState<SplitRow[]>(() => [
    newRow(preferredHomeId ?? destinations[0]?.id ?? ""),
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const totalSendKurus = rows.reduce((sum, row) => {
    const amt = parseTryToKurus(row.amountText);
    return sum + (amt && amt > 0 ? amt : 0);
  }, 0);

  const sourceBalance =
    cashAccounts.find((a) => a.id === fromAccountId)?.balance_kurus ?? null;

  const leftKurus =
    sourceBalance !== null ? sourceBalance - totalSendKurus : null;

  function updateRow(id: string, patch: Partial<SplitRow>) {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant first.");
      return;
    }
    const transfers = rows
      .map((row) => ({
        toId: row.toId,
        amount: parseTryToKurus(row.amountText),
      }))
      .filter(
        (t): t is { toId: string; amount: number } =>
          Boolean(t.toId) && t.amount !== null && t.amount > 0,
      );

    if (transfers.length === 0) {
      setError("Enter how much to send home (leave the rest as counter float).");
      return;
    }
    if (transfers.some((t) => t.toId === fromAccountId)) {
      setError("Pick a different drawer to send to.");
      return;
    }
    if (
      sourceBalance !== null &&
      transfers.reduce((s, t) => s + t.amount, 0) > sourceBalance
    ) {
      setError(
        `Total to send (${formatTry(totalSendKurus)}) is more than ${fromAccountName} has now.`,
      );
      return;
    }

    const isoDate = parseTrDate(sessionDate) ?? todayTrDate();
    setSubmitting(true);
    setError(null);
    try {
      const destNames: string[] = [];
      for (const t of transfers) {
        const destName =
          destinations.find((a) => a.id === t.toId)?.name ?? "drawer";
        destNames.push(destName);
        const idempotencyKey = submitIdempotency.beginSubmit();
        await apiFetch(`/entities/${entityId}/banking/transfers`, {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from_money_account_id: fromAccountId,
            to_money_account_id: t.toId,
            transfer_date: isoDate,
            amount_kurus: t.amount,
            description: `After close — to ${destName}`,
            actor_id: actorId,
          }),
        });
        submitIdempotency.completeSubmit();
        submitIdempotency.resetSubmit();
      }
      const sent = transfers.reduce((s, t) => s + t.amount, 0);
      const uniqueDest = [...new Set(destNames)];
      toast(
        uniqueDest.length === 1
          ? `Sent ${formatTry(sent)} to ${uniqueDest[0]}`
          : `Sent ${formatTry(sent)} to ${uniqueDest.length} drawers`,
      );
      onDone({
        sentKurus: sent,
        leftKurus:
          sourceBalance !== null ? sourceBalance - sent : null,
        fromName: fromAccountName,
        destLabel: uniqueDest.join(", "),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (destinations.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Day is closed for <strong>{fromAccountName}</strong>. Add another cash
          drawer (e.g. Cash at home) if you want to park part of the till there.
        </p>
        <Button type="button" onClick={onKeepHere}>
          Leave float in counter — done
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid="cash-split-panel">
      <div>
        <p className="text-sm font-medium">Send part home — leave float in counter</p>
        <p className="text-xs text-muted-foreground">
          Day is closed. <strong>{fromAccountName}</strong> is your counter
          {sourceBalance !== null ? ` (${formatTry(sourceBalance)} now)` : ""}.
          Send what you take home; cash left in Main is normal float — not a
          mistake.
        </p>
      </div>
      {rows.map((row, index) => (
        <div
          key={row.id}
          className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <div>
            <Label>Send to</Label>
            <Combobox
              value={row.toId}
              onValueChange={(value) => updateRow(row.id, { toId: value })}
              options={destinations.map((a) => ({
                value: a.id,
                label: a.name,
              }))}
              placeholder="Cash at home…"
            />
          </div>
          <div>
            <Label>Amount to send</Label>
            <MoneyInput
              value={row.amountText}
              onChange={(value) => updateRow(row.id, { amountText: value })}
              placeholder="0,00"
            />
          </div>
          <div className="flex items-end">
            {rows.length > 1 && (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setRows((prev) => prev.filter((r) => r.id !== row.id))
                }
              >
                Remove
              </Button>
            )}
            {rows.length === 1 && index === 0 && <span className="h-9" />}
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() => setRows((prev) => [...prev, newRow()])}
      >
        Add another drawer
      </Button>
      {totalSendKurus > 0 && leftKurus !== null && (
        <p className="text-sm tabular-nums text-muted-foreground">
          Send {formatTry(totalSendKurus)} · float left in {fromAccountName}:{" "}
          {formatTry(leftKurus)}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Sending…" : "Send and finish"}
        </Button>
        <Button type="button" variant="secondary" onClick={onKeepHere}>
          Leave all in counter — done
        </Button>
      </div>
    </form>
  );
}
