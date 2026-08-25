"use client";

/** State, accounts, validation, and submit for PartnerRecordForm. */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  PARTNER_RECORD_KIND_LABELS,
  type PartnerRecordFormProps,
  type PartnerRecordKind,
} from "@/components/forms/partner-record-types";
import { apiFetch } from "@/lib/api";
import { todayTrDate } from "@/lib/dates";
import { useEntity } from "@/lib/entity-context";
import {
  defaultMainDrawerId,
  loadCashAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import {
  partnerBalanceAmount,
  partnerDrawingRepaymentAllowed,
} from "@/lib/partner-balance";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export function usePartnerRecordForm({
  open,
  onClose,
  partnerId,
  unpaidProfitKurus = 0,
  drawingsNetKurus = 0,
  lockedKind,
  onSaved,
}: Omit<PartnerRecordFormProps, "embedded" | "netBalanceKurus" | "frontedBalanceKurus">) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const canReturn = partnerDrawingRepaymentAllowed(drawingsNetKurus);
  const outstandingDrawingKurus = canReturn ? Math.abs(drawingsNetKurus) : 0;

  const kindOptions = useMemo(() => {
    if (lockedKind) {
      return [
        {
          value: lockedKind,
          label: PARTNER_RECORD_KIND_LABELS[lockedKind],
        },
      ];
    }
    // Pay profit has its own button on the partner page — not in Record picker.
    // Partner returned cash is always listed; submit is blocked when nothing to repay.
    return [
      { value: "cash" as const, label: PARTNER_RECORD_KIND_LABELS.cash },
      { value: "capital" as const, label: PARTNER_RECORD_KIND_LABELS.capital },
      {
        value: "returned" as const,
        label: PARTNER_RECORD_KIND_LABELS.returned,
      },
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
    setDescription("");
    setError(null);
    void loadAccounts().catch(() => undefined);
  }, [open, loadAccounts, lockedKind]);

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
    if (!note && kind === "capital") {
      setError("Add a note — why did this partner invest?");
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

  const dialogTitle =
    lockedKind === "profit_paid" ? "Pay profit" : "Record";
  const submitLabel =
    lockedKind === "profit_paid" ? "Pay profit" : "Record";

  return {
    kind,
    setKind,
    kindOptions,
    accounts,
    cashAccountId,
    onDrawerChange,
    dateText,
    setDateText,
    amountText,
    setAmountText,
    description,
    setDescription,
    error,
    submitting,
    canReturn,
    outstandingDrawingKurus,
    unpaidProfitKurus,
    dialogTitle,
    submitLabel,
    onSubmit,
  };
}
