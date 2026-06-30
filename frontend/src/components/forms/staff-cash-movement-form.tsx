"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

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
import { parseFxNative } from "@/lib/fx-money";
import {
  loadBankAndCashAccounts,
  loadForeignCurrencyAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { parseTrDate, parseTryToKurus, formatTry } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";
import {
  advanceAppliedPreview,
  payableClearedPreview,
} from "@/lib/staff-salary";

type Props = {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  kind: "advance" | "payment";
  payCurrency: string;
  outstandingAdvanceMinor?: number;
  remainingAccrualMinor?: number;
  embedded?: boolean;
  onSaved?: () => void;
};

export function StaffCashMovementForm({
  open,
  onClose,
  employeeId,
  kind,
  payCurrency,
  outstandingAdvanceMinor = 0,
  remainingAccrualMinor = 0,
  embedded,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const isTry = payCurrency === "TRY";

  const [tryAccounts, setTryAccounts] = useState<MoneyAccountOption[]>([]);
  const [paymentGlAccountId, setPaymentGlAccountId] = useState("");
  const [fxAccounts, setFxAccounts] = useState<MoneyAccountOption[]>([]);
  const [fxWalletId, setFxWalletId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [tryCostText, setTryCostText] = useState("");
  const [description, setDescription] = useState(
    kind === "advance" ? "Salary advance" : "Salary payment",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    if (isTry) {
      const merged = await loadBankAndCashAccounts(entityId);
      setTryAccounts(merged);
      const cash = merged.find((a) => a.account_kind === "cash");
      setPaymentGlAccountId(
        cash?.gl_account_id ?? merged[0]?.gl_account_id ?? "",
      );
    } else {
      const wallets = await loadForeignCurrencyAccounts(entityId, payCurrency);
      setFxAccounts(wallets);
      setFxWalletId(wallets[0]?.id ?? "");
    }
  }, [entityId, isTry, payCurrency]);

  useEffect(() => {
    if (open) {
      setDateText(todayTrDate());
      void loadAccounts().catch(() => undefined);
    }
  }, [open, loadAccounts]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const paymentDate = parseTrDate(dateText);
    if (!paymentDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }

    let body: Record<string, unknown>;
    if (isTry) {
      const amountMinor = parseTryToKurus(amountText);
      if (amountMinor === null || amountMinor <= 0) {
        setError("Enter a valid amount.");
        return;
      }
      if (!paymentGlAccountId) {
        setError("Choose a cash or bank account.");
        return;
      }
      body = {
        payment_date: paymentDate,
        amount_minor: amountMinor,
        description,
        actor_id: actorId,
        payment_account_id: paymentGlAccountId,
      };
    } else {
      const amountMinor = parseFxNative(amountText);
      const tryCostKurus = parseTryToKurus(tryCostText);
      if (amountMinor === null || amountMinor <= 0) {
        setError(`Enter a valid ${payCurrency} amount.`);
        return;
      }
      if (tryCostKurus === null || tryCostKurus <= 0) {
        setError("Enter a valid TRY cost for this payment.");
        return;
      }
      if (!fxWalletId) {
        setError(`No ${payCurrency} wallet found — create one under Banking first.`);
        return;
      }
      body = {
        payment_date: paymentDate,
        amount_minor: amountMinor,
        description,
        actor_id: actorId,
        fx_money_account_id: fxWalletId,
        try_cost_kurus: tryCostKurus,
      };
    }

    setSubmitting(true);
    setError(null);
    try {
      const path =
        kind === "advance"
          ? `/entities/${entityId}/staff/employees/${employeeId}/advances`
          : `/entities/${entityId}/staff/employees/${employeeId}/payments`;
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(path, {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast(kind === "advance" ? "Advance recorded" : "Payment recorded");
      onClose();
      setAmountText("");
      setTryCostText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const title = kind === "advance" ? "Record advance" : "Record salary payment";

  const cashMinorPreview = isTry
    ? parseTryToKurus(amountText) ?? 0
    : parseFxNative(amountText) ?? 0;
  const advancePreview =
    kind === "payment" && cashMinorPreview > 0
      ? advanceAppliedPreview(
          cashMinorPreview,
          remainingAccrualMinor,
          outstandingAdvanceMinor,
        )
      : 0;
  const payablePreview =
    kind === "payment" && cashMinorPreview > 0
      ? payableClearedPreview(
          cashMinorPreview,
          remainingAccrualMinor,
          outstandingAdvanceMinor,
        )
      : 0;

  function formatPayMinor(minor: number): string {
    if (isTry) return formatTry(minor);
    return `${(minor / 100).toFixed(2)} ${payCurrency}`;
  }

  return (
    <FormDialogShell embedded={embedded} open={open} title={title} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {isTry
            ? `Pays from cash or bank (${payCurrency}).`
            : `Pays from ${payCurrency} wallet; enter TRY cost for GL posting.`}
        </p>
        <div>
          <Label htmlFor="staff-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="staff-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="staff-amount">Amount ({payCurrency})</Label>
          {isTry ? (
            <MoneyInput
              id="staff-amount"
              placeholder="15.000,00"
              value={amountText}
              onChange={setAmountText}
              required
            />
          ) : (
            <Input
              id="staff-amount"
              placeholder="1.000,00"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              required
            />
          )}
        </div>
        {!isTry && (
          <div>
            <Label htmlFor="staff-try-cost">TRY cost</Label>
            <MoneyInput
              id="staff-try-cost"
              placeholder="35.000,00"
              value={tryCostText}
              onChange={setTryCostText}
              required
            />
          </div>
        )}
        <div>
          <Label htmlFor="staff-desc">Description</Label>
          <Input
            id="staff-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        {isTry ? (
          <div>
            <Label htmlFor="staff-account">Pay from</Label>
            <Combobox
              id="staff-account"
              value={paymentGlAccountId}
              onValueChange={setPaymentGlAccountId}
              options={tryAccounts.map((a) => ({
                value: a.gl_account_id,
                label: `${a.name} (${a.account_kind})`,
              }))}
              placeholder="Pay from account…"
            />
          </div>
        ) : (
          <div>
            <Label htmlFor="staff-fx-wallet">{payCurrency} wallet</Label>
            <Combobox
              id="staff-fx-wallet"
              value={fxWalletId}
              onValueChange={setFxWalletId}
              options={
                fxAccounts.length === 0
                  ? [{ value: "", label: `No ${payCurrency} wallet` }]
                  : fxAccounts.map((a) => ({
                      value: a.id,
                      label: a.name,
                    }))
              }
              placeholder={`${payCurrency} wallet…`}
              disabled={fxAccounts.length === 0}
            />
          </div>
        )}
        {kind === "payment" && outstandingAdvanceMinor > 0 && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p>
              Outstanding advance:{" "}
              <span className="font-medium tabular-nums">
                {formatPayMinor(outstandingAdvanceMinor)}
              </span>
            </p>
            {remainingAccrualMinor > 0 && (
              <p className="mt-1 text-muted-foreground">
                Accrued salary not yet paid:{" "}
                <span className="tabular-nums">
                  {formatPayMinor(remainingAccrualMinor)}
                </span>
              </p>
            )}
            {advancePreview > 0 && (
              <p className="mt-2 text-muted-foreground">
                On save,{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatPayMinor(advancePreview)}
                </span>{" "}
                advance will auto-clear against salary payable
                {payablePreview > cashMinorPreview && (
                  <>
                    {" "}
                    (total payable cleared:{" "}
                    <span className="tabular-nums">
                      {formatPayMinor(payablePreview)}
                    </span>
                    )
                  </>
                )}
                .
              </p>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : title}
        </Button>
      </form>
    </FormDialogShell>
  );
}
