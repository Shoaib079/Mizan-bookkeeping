"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import { parseFxNative } from "@/lib/fx-money";
import {
  loadBankAndCashAccounts,
  loadForeignCurrencyAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  kind: "advance" | "payment";
  payCurrency: string;
  onSaved?: () => void;
};

export function StaffCashMovementForm({
  open,
  onClose,
  employeeId,
  kind,
  payCurrency,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
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
      await apiFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
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

  return (
    <Dialog open={open} title={title} onClose={onClose}>
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
          <Input
            id="staff-amount"
            placeholder={isTry ? "15.000,00" : "1.000,00"}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            required
          />
        </div>
        {!isTry && (
          <div>
            <Label htmlFor="staff-try-cost">TRY cost</Label>
            <Input
              id="staff-try-cost"
              placeholder="35.000,00"
              value={tryCostText}
              onChange={(e) => setTryCostText(e.target.value)}
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
            <Select
              id="staff-account"
              value={paymentGlAccountId}
              onChange={(e) => setPaymentGlAccountId(e.target.value)}
            >
              {tryAccounts.map((a) => (
                <option key={a.id} value={a.gl_account_id}>
                  {a.name} ({a.account_kind})
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div>
            <Label htmlFor="staff-fx-wallet">{payCurrency} wallet</Label>
            <Select
              id="staff-fx-wallet"
              value={fxWalletId}
              onChange={(e) => setFxWalletId(e.target.value)}
            >
              {fxAccounts.length === 0 ? (
                <option value="">No {payCurrency} wallet</option>
              ) : (
                fxAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))
              )}
            </Select>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : title}
        </Button>
      </form>
    </Dialog>
  );
}
