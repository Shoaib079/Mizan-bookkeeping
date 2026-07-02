"use client";

/** Expense receipt review — line edits with autosave draft (DESIGN_SYSTEM §10, Slice 10.7). */

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ResumeDraftBanner } from "@/components/ui/resume-draft-banner";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  filterExpenseAccounts,
  formatExpenseAccountLabel,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { apiFetch, documentUrl } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { statesDiffer, useFormDraft } from "@/lib/form-draft";
import { isReviewTerminalStatus } from "@/lib/review-status";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import { formatKurus, formatTrDate, parseTryToKurus } from "@/lib/money";

type ReceiptLine = {
  id: string;
  line_order: number;
  written_item_description: string | null;
  amount_kurus: number;
  amountTry?: string;
  expense_account_id: string;
  review_reason: string | null;
};

type ExpenseReceipt = {
  id: string;
  status: string;
  expense_date: string;
  money_account_id: string;
  receipt_total_kurus: number | null;
  review_reason: string | null;
  lines: ReceiptLine[];
};

type Account = ChartAccount;

type EditableLine = {
  id: string;
  written_item_description: string | null;
  amount_kurus: number;
  expense_account_id: string;
};

function toEditableLines(lines: ReceiptLine[]): EditableLine[] {
  return lines.map((line) => ({
    id: line.id,
    written_item_description: line.written_item_description,
    amount_kurus: line.amount_kurus,
    expense_account_id: line.expense_account_id,
  }));
}

function linesMatchServer(
  current: EditableLine[],
  server: EditableLine[] | null,
): boolean {
  if (!server) return true;
  return !statesDiffer(current, server);
}

type Props = {
  intakeId: string;
  embedded?: boolean;
  onUpdated?: (outcome?: "removed" | "updated") => void;
};

export function ReceiptReview({
  intakeId,
  embedded = false,
  onUpdated,
}: Props) {
  const router = useRouter();
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const [intake, setIntake] = useState<ExpenseReceipt | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [serverLines, setServerLines] = useState<EditableLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const editableLines = useMemo(() => toEditableLines(lines), [lines]);

  const isDraftEmpty = useCallback(
    (draft: EditableLine[]) => linesMatchServer(draft, serverLines),
    [serverLines],
  );

  const {
    resumeDraft,
    acceptResume,
    declineResume,
    clearDraft,
  } = useFormDraft({
    entityId,
    formKey: `receipt-review:${intakeId}`,
    value: editableLines,
    enabled: Boolean(intake && !isReviewTerminalStatus(intake.status)),
    isEmpty: isDraftEmpty,
  });

  const load = useCallback(async () => {
    if (!entityId) return;
    const [receipt, chart] = await Promise.all([
      apiFetch<ExpenseReceipt>(
        `/entities/${entityId}/expense-receipts/${intakeId}`,
      ),
      apiFetch<{ items: Account[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ),
    ]);
    setIntake(receipt);
    setLines(
      receipt.lines.map((line) => ({
        ...line,
        amountTry: formatKurus(line.amount_kurus),
      })),
    );
    setServerLines(toEditableLines(receipt.lines));
    setAccounts(chart.items);
  }, [entityId, intakeId]);

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "Load failed"),
    );
  }, [load]);

  useEffect(() => {
    if (!intake || isReviewTerminalStatus(intake.status)) return;
    window.setTimeout(
      () => document.getElementById("receipt-line-0-item")?.focus(),
      0,
    );
  }, [intake]);

  function updateLine(index: number, patch: Partial<ReceiptLine>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function applyLineDraft(draft: EditableLine[]) {
    setLines((prev) =>
      prev.map((line) => {
        const saved = draft.find((d) => d.id === line.id);
        if (!saved) return line;
        return {
          ...line,
          written_item_description: saved.written_item_description,
          amount_kurus: saved.amount_kurus,
          expense_account_id: saved.expense_account_id,
        };
      }),
    );
  }

  function handleResume() {
    const draft = acceptResume();
    if (!draft) return;
    applyLineDraft(draft);
  }

  async function onReject() {
    if (!entityId || !intake) return;
    setRejecting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch<void>(
        `/entities/${entityId}/expense-receipts/${intakeId}/reject`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectReason || null }),
        },
      );
      submitIdempotency.completeSubmit();
      clearDraft();
      toast("Receipt rejected");
      onUpdated?.("removed");
      if (!embedded) {
        router.push("/review/receipts");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setRejecting(false);
    }
  }

  async function onConfirm(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !intake) return;
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(`/entities/${entityId}/expense-receipts/${intakeId}/confirm`, {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor_id: actorId,
          lines: lines.map((line) => ({
            line_id: line.id,
            written_item_description: line.written_item_description,
            amount_kurus: line.amount_kurus,
            expense_account_id: line.expense_account_id,
          })),
        }),
      });
      submitIdempotency.completeSubmit();
      clearDraft();
      toast("Receipt expenses posted");
      onUpdated?.("removed");
      if (!embedded) {
        router.push("/review/receipts");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Set an entity ID in the sidebar to review this receipt.
      </p>
    );
  }

  if (!intake) {
    return <p className="text-sm text-muted-foreground">Loading receipt…</p>;
  }

  const expenseAccounts = filterExpenseAccounts(accounts);
  const isTerminal = isReviewTerminalStatus(intake.status);

  return (
    <form onSubmit={onConfirm} className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Original receipt</h2>
          <StatusBadge status={intake.status} />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={documentUrl(entityId, intakeId)}
          alt="Expense receipt"
          className="max-h-[480px] w-full rounded-md border border-border object-contain"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {formatTrDate(intake.expense_date)}
        </p>
        {intake.review_reason && (
          <p className="mt-2 text-sm text-warning">{intake.review_reason}</p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Lines</h2>
        {resumeDraft && !isTerminal && (
          <ResumeDraftBanner
            onResume={handleResume}
            onDismiss={declineResume}
          />
        )}
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div
              key={line.id}
              className="grid gap-2 rounded-md border border-border p-3"
            >
              <div>
                <Label>Item</Label>
                <Input
                  id={index === 0 ? "receipt-line-0-item" : undefined}
                  value={line.written_item_description ?? ""}
                  onChange={(e) =>
                    updateLine(index, {
                      written_item_description: e.target.value,
                    })
                  }
                  disabled={isTerminal}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Amount (TRY)</Label>
                  <MoneyInput
                    value={line.amountTry ?? formatKurus(line.amount_kurus)}
                    onChange={(text) => {
                      const kurus = parseTryToKurus(text);
                      updateLine(index, {
                        amountTry: text,
                        ...(kurus !== null ? { amount_kurus: kurus } : {}),
                      });
                    }}
                    showPreview={false}
                    disabled={isTerminal}
                  />
                </div>
                <div>
                  <Label>GL account</Label>
                  <Select
                    value={line.expense_account_id}
                    onChange={(e) =>
                      updateLine(index, { expense_account_id: e.target.value })
                    }
                    disabled={isTerminal}
                  >
                    {expenseAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {formatExpenseAccountLabel(a)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              {line.review_reason && (
                <p className="text-xs text-warning">{line.review_reason}</p>
              )}
            </div>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {!isTerminal ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={submitting || rejecting}>
              {submitting ? "Posting…" : "Confirm & post"}
            </Button>
            <div className="flex flex-1 flex-wrap items-end gap-2">
              <div className="min-w-[140px] flex-1">
                <Label htmlFor="receipt-reject">Reject reason</Label>
                <Input
                  id="receipt-reject"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={onReject}
                disabled={rejecting || submitting}
              >
                {rejecting ? "Rejecting…" : "Reject"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            This receipt is {intake.status} and cannot be changed.
          </p>
        )}
      </div>
    </form>
  );
}
