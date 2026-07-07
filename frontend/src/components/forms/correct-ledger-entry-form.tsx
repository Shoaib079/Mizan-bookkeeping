"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { formatChartAccountLabel } from "@/lib/chart-accounts";
import { useEntity } from "@/lib/entity-context";
import { formatKurus, formatTrDate, parseTrDate, parseTryToKurus } from "@/lib/money";
import { withPeriodUnlockReason } from "@/lib/period-unlock";
import { usePeriodUnlockSubmit } from "@/lib/use-period-unlock-submit";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

type PostingLine = {
  account_id: string;
  amount_kurus: number;
  side: "debit" | "credit";
};

export type CorrectableLedgerEntry = {
  id: string;
  entry_date: string;
  description: string;
  source: string;
  lines: PostingLine[];
};

type Account = { id: string; code: string; name_en: string; name_tr?: string };

type Props = {
  open: boolean;
  entry: CorrectableLedgerEntry | null;
  onClose: () => void;
  onSaved: () => void;
};

export function CorrectLedgerEntryForm({
  open,
  entry,
  onClose,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithPeriodUnlock, PeriodUnlockDialog } = usePeriodUnlockSubmit();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dateText, setDateText] = useState("");
  const [voidDateText, setVoidDateText] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [lineAmounts, setLineAmounts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const chartRes = await apiFetch<{ items: Account[] }>(
      `/entities/${entityId}/chart-of-accounts?limit=200`,
    );
    setAccounts(chartRes.items);
  }, [entityId]);

  useEffect(() => {
    if (!open || !entry) return;
    void loadAccounts().catch(() => undefined);
    setDateText(formatTrDate(entry.entry_date));
    setVoidDateText(formatTrDate(entry.entry_date));
    setDescription(entry.description);
    setReason("");
    setLineAmounts(entry.lines.map((line) => formatKurus(line.amount_kurus)));
    setError(null);
  }, [open, entry, loadAccounts]);

  const accountLabel = (accountId: string) => {
    const acct = accounts.find((a) => a.id === accountId);
    return acct ? formatChartAccountLabel(acct) : accountId.slice(0, 8);
  };

  const parsedLines =
    entry?.lines.map((line, index) => ({
      account_id: line.account_id,
      side: line.side,
      amount_kurus: parseTryToKurus(lineAmounts[index] ?? ""),
    })) ?? [];

  const linesValid =
    parsedLines.length >= 2 &&
    parsedLines.every(
      (line) => line.amount_kurus !== null && line.amount_kurus > 0,
    );
  const debitTotal = parsedLines.reduce(
    (sum, line) =>
      sum + (line.side === "debit" ? (line.amount_kurus ?? 0) : 0),
    0,
  );
  const creditTotal = parsedLines.reduce(
    (sum, line) =>
      sum + (line.side === "credit" ? (line.amount_kurus ?? 0) : 0),
    0,
  );
  const balanced = linesValid && debitTotal === creditTotal;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !entry) {
      setError("Select a restaurant and entry first.");
      return;
    }
    const entryDate = parseTrDate(dateText);
    const voidDate = parseTrDate(voidDateText);
    if (!entryDate || !voidDate) {
      setError("Dates must be DD.MM.YYYY.");
      return;
    }
    if (!balanced) {
      setError("Debits must equal credits with valid line amounts.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await submitWithPeriodUnlock(async (periodUnlockReason) =>
        apiFetch(
          `/entities/${entityId}/ledger/entries/${entry.id}/correct`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withPeriodUnlockReason(
                {
                  entry_date: entryDate,
                  void_date: voidDate,
                  description: description.trim() || entry.description,
                  actor_id: actorId,
                  reason: reason.trim() || null,
                  lines: parsedLines.map((line) => ({
                    account_id: line.account_id,
                    amount_kurus: line.amount_kurus,
                    side: line.side,
                  })),
                },
                periodUnlockReason,
              ),
            ),
          },
        ),
      );
      submitIdempotency.completeSubmit();
      onClose();
      onSaved();
      toast("Ledger entry corrected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} title="Edit ledger entry" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="cle-date">New entry date (DD.MM.YYYY)</Label>
            <DateInput
              id="cle-date"
              value={dateText}
              onChange={setDateText}
              required
            />
          </div>
          <div>
            <Label htmlFor="cle-void-date">Void date (DD.MM.YYYY)</Label>
            <DateInput
              id="cle-void-date"
              value={voidDateText}
              onChange={setVoidDateText}
              required
            />
          </div>
          <div>
            <Label htmlFor="cle-desc">Description</Label>
            <Input
              id="cle-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          {entry?.lines.map((line, index) => (
            <div key={`${line.account_id}-${line.side}`}>
              <Label htmlFor={`cle-line-${index}`}>
                {line.side === "debit" ? "Debit" : "Credit"} ·{" "}
                {accountLabel(line.account_id)}
              </Label>
              <MoneyInput
                id={`cle-line-${index}`}
                value={lineAmounts[index] ?? ""}
                onChange={(value) =>
                  setLineAmounts((prev) => {
                    const next = [...prev];
                    next[index] = value;
                    return next;
                  })
                }
                required
              />
            </div>
          ))}
          {linesValid && !balanced && (
            <p className="text-sm text-destructive">
              Debits ({formatKurus(debitTotal)}) must equal credits (
              {formatKurus(creditTotal)}).
            </p>
          )}
          <div>
            <Label htmlFor="cle-reason">Edit reason (optional)</Label>
            <Input
              id="cle-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting || !entry || !balanced}>
            {submitting ? "Saving…" : "Save correction"}
          </Button>
        </form>
      </Dialog>
      <PeriodUnlockDialog />
    </>
  );
}
