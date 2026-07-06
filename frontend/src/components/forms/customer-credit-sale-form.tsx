"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import {
  filterRevenueAccounts,
  formatChartAccountLabel,
  type ChartAccountLike,
} from "@/lib/chart-accounts";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import { formatFxNative, parseFxNative } from "@/lib/fx-money";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

const FOREX_OPTIONS = [
  { value: "", label: "No forex quote" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  customerId: string;
  embedded?: boolean;
  onSaved?: () => void;
};

export function CustomerCreditSaleForm({
  open,
  onClose,
  customerId,
  embedded,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const [revenueAccounts, setRevenueAccounts] = useState<
    (ChartAccountLike & { id: string })[]
  >([]);
  const [revenueAccountId, setRevenueAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [paxText, setPaxText] = useState("");
  const [rateTryText, setRateTryText] = useState("");
  const [forexCurrency, setForexCurrency] = useState("");
  const [rateForexText, setRateForexText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [description, setDescription] = useState("Group sale");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pax = useMemo(() => {
    const n = Number.parseInt(paxText.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [paxText]);

  const rateTryKurus = parseTryToKurus(rateTryText);
  const rateForexMinor = parseFxNative(rateForexText);

  const computedTotalKurus = useMemo(() => {
    if (pax === null || rateTryKurus === null) return null;
    return pax * rateTryKurus;
  }, [pax, rateTryKurus]);

  const computedTotalForexMinor = useMemo(() => {
    if (pax === null || rateForexMinor === null || !forexCurrency) return null;
    return pax * rateForexMinor;
  }, [pax, rateForexMinor, forexCurrency]);

  useEffect(() => {
    if (amountTouched || computedTotalKurus === null) return;
    setAmountText((computedTotalKurus / 100).toFixed(2).replace(".", ","));
  }, [amountTouched, computedTotalKurus]);

  const loadChart = useCallback(async () => {
    if (!entityId) return;
    const chart = await apiFetch<{ items: ChartAccountLike[] }>(
      `/entities/${entityId}/chart-of-accounts?limit=200`,
    );
    const revenue = filterRevenueAccounts(chart.items).filter(
      (a): a is ChartAccountLike & { id: string } => Boolean(a.id),
    );
    setRevenueAccounts(revenue);
    const sales = revenue.find((a) => a.code === "4000");
    if (sales) setRevenueAccountId(sales.id);
    else if (revenue[0]) setRevenueAccountId(revenue[0].id);
  }, [entityId]);

  useEffect(() => {
    if (open) {
      setDateText(todayTrDate());
      setPaxText("");
      setRateTryText("");
      setForexCurrency("");
      setRateForexText("");
      setAmountText("");
      setAmountTouched(false);
      setDescription("Group sale");
      void loadChart().catch(() => undefined);
    }
  }, [open, loadChart]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const amountKurus = parseTryToKurus(amountText);
    const saleDate = parseTrDate(dateText);
    if (amountKurus === null || amountKurus <= 0) {
      setError("Enter a valid total amount in TRY.");
      return;
    }
    if (!saleDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (forexCurrency && (rateForexMinor === null || rateForexMinor <= 0)) {
      setError("Enter a valid forex rate per person.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/customers/${customerId}/credit-sales`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sale_date: saleDate,
            amount_kurus: amountKurus,
            description,
            actor_id: actorId,
            revenue_account_id: revenueAccountId || null,
            pax: pax ?? undefined,
            rate_per_person_kurus: rateTryKurus ?? undefined,
            forex_currency: forexCurrency || undefined,
            rate_per_person_forex_minor: rateForexMinor ?? undefined,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("Group sale recorded");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialogShell embedded={embedded} open={open} title="Group / credit sale" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="cs-date">Service date (DD.MM.YYYY)</Label>
          <DateInput
            id="cs-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="cs-pax">Pax (guests)</Label>
            <Input
              id="cs-pax"
              inputMode="numeric"
              value={paxText}
              onChange={(e) => setPaxText(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 45"
            />
          </div>
          <div>
            <Label htmlFor="cs-rate-try">Rate per person (TRY)</Label>
            <MoneyInput
              id="cs-rate-try"
              value={rateTryText}
              onChange={setRateTryText}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="cs-forex">Forex currency (optional)</Label>
            <Combobox
              id="cs-forex"
              value={forexCurrency}
              onValueChange={setForexCurrency}
              options={FOREX_OPTIONS}
              placeholder="USD / EUR / GBP"
            />
          </div>
          <div>
            <Label htmlFor="cs-rate-fx">Rate per person (forex)</Label>
            <Input
              id="cs-rate-fx"
              value={rateForexText}
              onChange={(e) => setRateForexText(e.target.value)}
              placeholder={forexCurrency ? `e.g. 25,00 ${forexCurrency}` : "Select currency first"}
              disabled={!forexCurrency}
            />
          </div>
        </div>
        {(computedTotalKurus !== null || computedTotalForexMinor !== null) && (
          <p className="text-sm text-muted-foreground">
            {computedTotalKurus !== null && (
              <span>Total TRY: {formatTry(computedTotalKurus)}</span>
            )}
            {computedTotalKurus !== null && computedTotalForexMinor !== null && " · "}
            {computedTotalForexMinor !== null && forexCurrency && (
              <span>
                Total forex: {formatFxNative(computedTotalForexMinor, forexCurrency)}
              </span>
            )}
          </p>
        )}
        <div>
          <Label htmlFor="cs-amount">Total to book (TRY)</Label>
          <MoneyInput
            id="cs-amount"
            value={amountText}
            onChange={(v) => {
              setAmountTouched(true);
              setAmountText(v);
            }}
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Receivable and revenue are recorded in lira. Forex line is stored for
            your agency invoice reference.
          </p>
        </div>
        <div>
          <Label htmlFor="cs-desc">Description</Label>
          <Input
            id="cs-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="cs-revenue">Revenue account</Label>
          <Combobox
            id="cs-revenue"
            value={revenueAccountId}
            onValueChange={setRevenueAccountId}
            options={revenueAccounts.map((a) => ({
              value: a.id,
              label: formatChartAccountLabel(a),
            }))}
            placeholder="Revenue account…"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : "Record group sale"}
        </Button>
      </form>
    </FormDialogShell>
  );
}
