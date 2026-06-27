"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ValidationHint } from "@/components/ui/validation-hint";
import { RecordingForBanner } from "@/components/forms/recording-for-banner";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { isEntitySettingEnabled } from "@/lib/entity-settings";
import { defaultMainDrawerId } from "@/lib/load-money-accounts";
import { useEntity } from "@/lib/entity-context";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";
import { useToast } from "@/lib/toast";
import { useRegisterUnsaved } from "@/lib/unsaved-work";

type MoneyAccount = { id: string; name: string; account_kind?: string };

type ManualDailySalesResponse = {
  status: string;
  review_reason: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ManualDailySalesForm({ open, onClose }: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

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
  const [showSalesHint, setShowSalesHint] = useState(false);
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
    const drawerId = defaultMainDrawerId(
      accountsRes.items.map((a) => ({
        id: a.id,
        gl_account_id: "",
        name: a.name,
        account_kind: a.account_kind ?? "cash",
      })),
    );
    if (drawerId) setMoneyAccountId(drawerId);
    else if (accountsRes.items[0]) setMoneyAccountId(accountsRes.items[0].id);
  }, [entityId]);

  useEffect(() => {
    if (open) {
      setDateText(todayTrDate());
      void loadOptions().catch(() => undefined);
    }
  }, [open, loadOptions]);

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
  const submitBlocked = totalKurus <= 0 || !moneyAccountId;
  const dirty =
    open &&
    (cashText.trim() !== "" ||
      cardText.trim() !== "" ||
      zReportText.trim() !== "");

  useRegisterUnsaved("manual-daily-sales", dirty, open);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Set an entity ID in the sidebar first.");
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
    setShowSalesHint(false);
    try {
      const body: Record<string, unknown> = {
        sales_date: salesDate,
        cash_kurus: cashKurus,
        card_kurus: cardKurus,
        money_account_id: moneyAccountId,
        actor_id: actorId,
      };
      if (zReportEnabled && zReportKurus !== null && zReportKurus > 0) {
        body.z_report_kurus = zReportKurus;
      }

      const idempotencyKey = submitIdempotency.beginSubmit();
      const result = await apiFetch<ManualDailySalesResponse>(
        `/entities/${entityId}/pos/manual-daily-sales`,
        {
          method: "POST",
        idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      submitIdempotency.completeSubmit();

      if (result.status === "needs_review") {
        const reason =
          result.review_reason ??
          "Daily sales need review before they can post to the ledger.";
        setError(
          `${reason} Fix the figures here, or open the Sales list to finish review.`,
        );
        submitIdempotency.completeSubmit();
        setShowSalesHint(true);
        return;
      }

      if (result.status !== "posted") {
        setError(
          `Unexpected status "${result.status}". Check the Sales list (/sales) before posting again.`,
        );
        submitIdempotency.completeSubmit();
        return;
      }

      onClose();
      toast("Daily sales posted");
      setCashText("");
      setCardText("");
      setZReportText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Daily sales (manual)" onClose={onClose}>
      <RecordingForBanner />
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="sales-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="sales-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="sales-cash">Cash sales</Label>
          <MoneyInput
            id="sales-cash"
            placeholder="0,00"
            value={cashText}
            onChange={setCashText}
            showPreview={false}
            showInvalidHint={false}
          />
        </div>
        <div>
          <Label htmlFor="sales-card">Card sales</Label>
          <MoneyInput
            id="sales-card"
            placeholder="0,00"
            value={cardText}
            onChange={setCardText}
            showPreview={false}
            showInvalidHint={false}
          />
        </div>
        {zReportEnabled && (
          <div>
            <Label htmlFor="sales-z">Card-terminal Z report total (optional)</Label>
            <MoneyInput
              id="sales-z"
              placeholder="0,00"
              value={zReportText}
              onChange={setZReportText}
              showPreview={false}
              showInvalidHint={false}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              When entered, Z must match card sales or the day routes to Needs
              Review.
            </p>
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
            {formatTry(cardKurus)}). The day will route to Needs Review.
          </ValidationHint>
        )}
        <div>
          <Label htmlFor="sales-drawer">Cash drawer</Label>
          <Combobox
            id="sales-drawer"
            value={moneyAccountId}
            onValueChange={setMoneyAccountId}
            options={cashAccounts.map((a) => ({
              value: a.id,
              label: a.name,
            }))}
            placeholder="Cash drawer…"
          />
        </div>
        {error && (
          <div className="space-y-1">
            <p className="text-sm text-destructive">{error}</p>
            {showSalesHint && (
              <p className="text-xs text-muted-foreground">
                Open{" "}
                <Link href="/sales" className="text-primary underline">
                  Sales
                </Link>{" "}
                to review this day after fixing figures or recording the tip on
                an expense receipt.
              </p>
            )}
          </div>
        )}
        <Button type="submit" disabled={submitting || submitBlocked}>
          {submitting ? "Posting…" : "Post daily sales"}
        </Button>
      </form>
    </Dialog>
  );
}
