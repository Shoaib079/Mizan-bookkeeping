"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ValidationHint } from "@/components/ui/validation-hint";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { isEntitySettingEnabled } from "@/lib/entity-settings";
import { useEntity } from "@/lib/entity-context";
import { formatKurus, formatTry, formatTrDate, parseTrDate, parseTryToKurus } from "@/lib/money";
import { withPeriodUnlockReason } from "@/lib/period-unlock";
import { usePeriodUnlockSubmit } from "@/lib/use-period-unlock-submit";
import { useToast } from "@/lib/toast";
import type { PosDailySummary } from "@/lib/pos-delivery-types";

type MoneyAccount = { id: string; name: string };

type Props = {
  open: boolean;
  summary: PosDailySummary | null;
  onClose: () => void;
  onSaved: () => void;
};

export function CorrectDailySalesForm({
  open,
  summary,
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

  const [cashAccounts, setCashAccounts] = useState<MoneyAccount[]>([]);
  const [zReportEnabled, setZReportEnabled] = useState(false);
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [cashText, setCashText] = useState("");
  const [cardText, setCardText] = useState("");
  const [zReportText, setZReportText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadOptions = useCallback(async () => {
    if (!entityId) return;
    const [accountsRes, zEnabled] = await Promise.all([
      apiFetch<{ items: MoneyAccount[] }>(
        `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
      ),
      isEntitySettingEnabled(entityId, "card_tips_z_report_enabled"),
    ]);
    setCashAccounts(accountsRes.items);
    setZReportEnabled(zEnabled);
  }, [entityId]);

  useEffect(() => {
    if (!open || !summary) return;
    void loadOptions().catch(() => undefined);
    setDateText(
      summary.summary_date ? formatTrDate(summary.summary_date) : "",
    );
    setCashText(formatKurus(summary.confirmed_cash_kurus ?? summary.cash_kurus));
    setCardText(formatKurus(summary.confirmed_card_kurus ?? summary.card_kurus));
    setZReportText(
      summary.z_report_kurus != null ? formatKurus(summary.z_report_kurus) : "",
    );
    setMoneyAccountId(summary.money_account_id ?? "");
    setError(null);
  }, [open, summary, loadOptions]);

  useEffect(() => {
    if (open && summary && cashAccounts.length > 0 && !moneyAccountId) {
      setMoneyAccountId(summary.money_account_id ?? cashAccounts[0]?.id ?? "");
    }
  }, [open, summary, cashAccounts, moneyAccountId]);

  const cashKurus = parseTryToKurus(cashText) ?? 0;
  const cardKurus = parseTryToKurus(cardText) ?? 0;
  const totalKurus = cashKurus + cardKurus;
  const zReportKurus = zReportEnabled ? parseTryToKurus(zReportText) : null;
  const hasSalesInput = cashText.trim() !== "" || cardText.trim() !== "";
  const salesTotalInvalid = hasSalesInput && totalKurus <= 0;
  const zMismatch =
    zReportEnabled &&
    zReportKurus !== null &&
    zReportKurus > 0 &&
    cardKurus !== zReportKurus;
  const submitBlocked = totalKurus <= 0 || !moneyAccountId || !summary;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !summary) {
      setError("Select a restaurant and summary first.");
      return;
    }
    const salesDate = parseTrDate(dateText);
    if (!salesDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (totalKurus <= 0) {
      setError("Enter cash and/or card sales.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const result = await submitWithPeriodUnlock(async (periodUnlockReason) => {
        const body: Record<string, unknown> = withPeriodUnlockReason(
          {
            money_account_id: moneyAccountId,
            actor_id: actorId,
            cash_kurus: cashKurus,
            card_kurus: cardKurus,
            summary_date: salesDate,
          },
          periodUnlockReason,
        );
        if (zReportEnabled && zReportKurus !== null && zReportKurus > 0) {
          body.z_report_kurus = zReportKurus;
        }
        return apiFetch<{ status: string }>(
          `/entities/${entityId}/pos/daily-summaries/${summary.id}/correct`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
      });
      submitIdempotency.completeSubmit();

      if (result.status !== "posted") {
        setError(
          `Unexpected status "${result.status}". Check the Sales list before trying again.`,
        );
        return;
      }

      onClose();
      onSaved();
      toast("Daily sales corrected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <Dialog open={open} title="Edit daily sales" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="correct-sales-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="correct-sales-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="correct-sales-cash">Cash sales</Label>
          <MoneyInput
            id="correct-sales-cash"
            placeholder="0,00"
            value={cashText}
            onChange={setCashText}
            showPreview={false}
            showInvalidHint={false}
          />
        </div>
        <div>
          <Label htmlFor="correct-sales-card">Card sales</Label>
          <MoneyInput
            id="correct-sales-card"
            placeholder="0,00"
            value={cardText}
            onChange={setCardText}
            showPreview={false}
            showInvalidHint={false}
          />
        </div>
        {zReportEnabled && (
          <div>
            <Label htmlFor="correct-sales-z">Card-terminal Z report total</Label>
            <MoneyInput
              id="correct-sales-z"
              placeholder="0,00"
              value={zReportText}
              onChange={setZReportText}
              showPreview={false}
              showInvalidHint={false}
            />
          </div>
        )}
        {hasSalesInput && (
          <ValidationHint variant={salesTotalInvalid ? "error" : "hint"}>
            {salesTotalInvalid
              ? "Enter cash and/or card sales — total cannot be zero."
              : `Total: ${formatTry(totalKurus)}`}
          </ValidationHint>
        )}
        {zMismatch && (
          <ValidationHint variant="warning">
            Z report ({formatTry(zReportKurus!)}) does not match card sales (
            {formatTry(cardKurus)}).
          </ValidationHint>
        )}
        <div>
          <Label htmlFor="correct-sales-drawer">Cash drawer</Label>
          <Combobox
            id="correct-sales-drawer"
            value={moneyAccountId}
            onValueChange={setMoneyAccountId}
            options={cashAccounts.map((a) => ({
              value: a.id,
              label: a.name,
            }))}
            placeholder="Cash drawer…"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting || submitBlocked}>
          {submitting ? "Saving…" : "Save correction"}
        </Button>
      </form>
    </Dialog>
    <PeriodUnlockDialog />
    </>
  );
}
