"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { CashDrawerPicker } from "@/components/forms/cash-drawer-picker";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import {
  defaultMainDrawerId,
  loadCashAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import {
  formatPartnerNetBalance,
  partnerBalanceAmount,
  partnerBalanceHeading,
  partnerDrawingRepaymentAllowed,
} from "@/lib/partner-balance";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

export type PartnerRecordKind =
  | "cash"
  | "profit_paid"
  | "capital"
  | "returned";

type Props = {
  open: boolean;
  onClose: () => void;
  partnerId: string;
  netBalanceKurus?: number;
  frontedBalanceKurus?: number;
  unpaidProfitKurus?: number;
  /** Outstanding drawings net — negative means repayable. */
  drawingsNetKurus?: number;
  /** When set, skip type picker (e.g. dedicated Pay profit button). */
  lockedKind?: PartnerRecordKind;
  embedded?: boolean;
  onSaved?: () => void;
};

const KIND_LABELS: Record<PartnerRecordKind, string> = {
  cash: "Cash taken / withdrawn",
  profit_paid: "Pay profit",
  capital: "Capital in",
  returned: "Partner returned cash",
};

export function PartnerRecordForm({
  open,
  onClose,
  partnerId,
  netBalanceKurus,
  frontedBalanceKurus,
  unpaidProfitKurus = 0,
  drawingsNetKurus = 0,
  lockedKind,
  embedded,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const canReturn = partnerDrawingRepaymentAllowed(drawingsNetKurus);
  const outstandingDrawingKurus = canReturn ? Math.abs(drawingsNetKurus) : 0;

  const kindOptions = useMemo(() => {
    if (lockedKind) {
      return [{ value: lockedKind, label: KIND_LABELS[lockedKind] }];
    }
    // Pay profit has its own button on the partner page — not in Record picker.
    // Partner returned cash is always listed; submit is blocked when nothing to repay.
    return [
      { value: "cash" as const, label: KIND_LABELS.cash },
      { value: "capital" as const, label: KIND_LABELS.capital },
      { value: "returned" as const, label: KIND_LABELS.returned },
    ];
  }, [lockedKind]);

  const [kind, setKind] = useState<PartnerRecordKind>(lockedKind ?? "cash");
  const [accounts, setAccounts] = useState<MoneyAccountOption[]>([]);
  const [cashAccountId, setCashAccountId] = useState("");
  const [paymentGlAccountId, setPaymentGlAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const defaultDescription = useMemo(() => {
    switch (kind) {
      case "cash":
        return "Partner cash payment";
      case "profit_paid":
        return "Partner profit paid";
      case "capital":
        return "";
      case "returned":
        return "Partner returned cash";
    }
  }, [kind]);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const options = await loadCashAccounts(entityId);
    setAccounts(options);
    const drawerId = defaultMainDrawerId(options);
    const pick = options.find((a) => a.id === drawerId) ?? options[0];
    if (pick) {
      setCashAccountId(pick.id);
      setPaymentGlAccountId(pick.gl_account_id);
    } else {
      setCashAccountId("");
      setPaymentGlAccountId("");
    }
  }, [entityId]);

  useEffect(() => {
    if (!open) return;
    setKind(lockedKind ?? "cash");
    setDateText(todayTrDate());
    setAmountText("");
    setError(null);
    void loadAccounts().catch(() => undefined);
  }, [open, loadAccounts, lockedKind]);

  useEffect(() => {
    if (open) setDescription(defaultDescription);
  }, [open, defaultDescription]);

  useEffect(() => {
    if (lockedKind) return;
    if (!kindOptions.some((o) => o.value === kind)) {
      setKind("cash");
    }
  }, [kind, kindOptions, lockedKind]);

  function onDrawerChange(id: string) {
    setCashAccountId(id);
    const pick = accounts.find((a) => a.id === id);
    setPaymentGlAccountId(pick?.gl_account_id ?? "");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const amountKurus = parseTryToKurus(amountText);
    const movementDate = parseTrDate(dateText);
    if (amountKurus === null || amountKurus <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!movementDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (!paymentGlAccountId) {
      setError(
        "Choose a cash drawer. Bank movements: classify on the bank statement.",
      );
      return;
    }
    const note = description.trim();
    if (!note) {
      setError(
        kind === "capital"
          ? "Add a note — why did this partner invest?"
          : "Description is required.",
      );
      return;
    }
    if (kind === "profit_paid") {
      if (unpaidProfitKurus <= 0) {
        setError("No unpaid allocated profit to pay. Allocate profit first.");
        return;
      }
      if (amountKurus > unpaidProfitKurus) {
        setError(
          `Payment cannot exceed unpaid profit of ${formatTry(unpaidProfitKurus)}.`,
        );
        return;
      }
    }
    if (kind === "returned") {
      if (!canReturn) {
        setError("This partner has no outstanding drawing to repay.");
        return;
      }
      if (amountKurus > outstandingDrawingKurus) {
        setError(
          `Cannot exceed ${partnerBalanceAmount(outstandingDrawingKurus)}.`,
        );
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      if (kind === "cash") {
        const result = await apiFetch<{
          reimbursement_kurus: number;
          drawing_kurus: number;
        }>(`/entities/${entityId}/partners/${partnerId}/cash-payments`, {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_date: movementDate,
            amount_kurus: amountKurus,
            description: note,
            actor_id: actorId,
            payment_account_id: paymentGlAccountId,
          }),
        });
        const parts: string[] = [];
        if (result.reimbursement_kurus > 0) {
          parts.push(`settled ${formatTry(result.reimbursement_kurus)}`);
        }
        if (result.drawing_kurus > 0) {
          parts.push(`withdrawal ${formatTry(result.drawing_kurus)}`);
        }
        toast(
          parts.length > 0
            ? `Recorded (${parts.join(", ")})`
            : "Recorded",
        );
      } else {
        const path =
          kind === "capital"
            ? "capital-contributions"
            : kind === "profit_paid"
              ? "profit-payments"
              : "drawing-repayments";
        const body =
          kind === "capital"
            ? {
                contribution_date: movementDate,
                amount_kurus: amountKurus,
                description: note,
                actor_id: actorId,
                payment_account_id: paymentGlAccountId,
              }
            : {
                payment_date: movementDate,
                amount_kurus: amountKurus,
                description: note,
                actor_id: actorId,
                payment_account_id: paymentGlAccountId,
              };
        await apiFetch(`/entities/${entityId}/partners/${partnerId}/${path}`, {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast(
          kind === "capital"
            ? "Capital recorded"
            : kind === "profit_paid"
              ? "Profit payment recorded"
              : "Cash returned recorded",
        );
      }
      submitIdempotency.completeSubmit();
      onSaved?.();
      onClose();
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const fronted = Math.max(0, frontedBalanceKurus ?? 0);
  const dialogTitle =
    lockedKind === "profit_paid" ? "Pay profit" : "Record";
  const submitLabel =
    lockedKind === "profit_paid" ? "Pay profit" : "Record";

  return (
    <FormDialogShell
      embedded={embedded}
      open={open}
      title={dialogTitle}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Cash drawer only. Bank: classify on the statement.
        </p>
        {!lockedKind && (
          <div>
            <Label>What to record</Label>
            <Combobox
              value={kind}
              onValueChange={(v) => setKind(v as PartnerRecordKind)}
              options={kindOptions}
              placeholder="Choose…"
            />
          </div>
        )}
        {kind === "cash" && netBalanceKurus !== undefined && (
          <p className="text-sm text-muted-foreground">
            {partnerBalanceHeading(netBalanceKurus)}:{" "}
            {partnerBalanceAmount(netBalanceKurus)}
          </p>
        )}
        {kind === "cash" && fronted > 0 && (
          <p className="text-xs text-muted-foreground">
            Fronted still owed: {formatTry(fronted)}
            {netBalanceKurus !== undefined && netBalanceKurus !== fronted
              ? ` · Net book: ${formatPartnerNetBalance(netBalanceKurus)}`
              : null}
            . Cash taken / withdrawn settles fronted first; extra is a withdrawal.
          </p>
        )}
        {kind === "profit_paid" && (
          <p className="text-sm text-muted-foreground">
            Unpaid allocated profit: {formatTry(unpaidProfitKurus)}
            {unpaidProfitKurus <= 0
              ? " — allocate profit on the Partners list first."
              : null}
          </p>
        )}
        {kind === "returned" && (
          <p
            className={
              canReturn
                ? "text-sm text-muted-foreground"
                : "text-sm text-destructive"
            }
          >
            {canReturn ? (
              <>
                Outstanding drawing:{" "}
                {partnerBalanceAmount(outstandingDrawingKurus)}
              </>
            ) : (
              <>
                Nothing to repay right now — there is no open withdrawal to
                close. If they are putting in new money, use Capital in instead.
              </>
            )}
          </p>
        )}
        <div>
          <Label htmlFor="pr-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="pr-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="pr-amount">Amount (TRY)</Label>
          <MoneyInput
            id="pr-amount"
            value={amountText}
            onChange={setAmountText}
            required
          />
        </div>
        <div>
          <Label htmlFor="pr-desc">
            {kind === "capital" ? "Note (required)" : "Description"}
          </Label>
          <Input
            id="pr-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <CashDrawerPicker
          id="pr-cash"
          accounts={accounts}
          value={cashAccountId}
          onValueChange={onDrawerChange}
          label={
            kind === "capital" || kind === "returned"
              ? "Cash drawer"
              : "Pay from cash"
          }
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="submit"
          disabled={submitting || (kind === "returned" && !canReturn)}
        >
          {submitting ? "Recording…" : submitLabel}
        </Button>
      </form>
    </FormDialogShell>
  );
}

/** @deprecated Use PartnerRecordForm */
export const PartnerReimbursementForm = PartnerRecordForm;
