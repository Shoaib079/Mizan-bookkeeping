"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { StatusBadge } from "@/components/ui/status-badge";
import { ValidationHint } from "@/components/ui/validation-hint";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { isEntitySettingEnabled } from "@/lib/entity-settings";
import { useEntity } from "@/lib/entity-context";
import {
  formatKurus,
  formatTrDate,
  formatTry,
  parseTrDate,
  parseTryToKurus,
} from "@/lib/money";
import type { MoneyAccountOption, PosDailySummary } from "@/lib/pos-delivery-types";

type Props = {
  summaryId: string;
  onUpdated?: () => void;
};

export function PosSummaryReview({ summaryId, onUpdated }: Props) {
  const router = useRouter();
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const [summary, setSummary] = useState<PosDailySummary | null>(null);
  const [cashAccounts, setCashAccounts] = useState<MoneyAccountOption[]>([]);
  const [zReportEnabled, setZReportEnabled] = useState(false);
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [cashText, setCashText] = useState("");
  const [cardText, setCardText] = useState("");
  const [zReportText, setZReportText] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) return;
    const [summaryRes, accountsRes, zEnabled] = await Promise.all([
      apiFetch<PosDailySummary>(
        `/entities/${entityId}/pos/daily-summaries/${summaryId}`,
      ),
      apiFetch<{ items: MoneyAccountOption[] }>(
        `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
      ),
      isEntitySettingEnabled(entityId, "card_tips_z_report_enabled"),
    ]);
    setSummary(summaryRes);
    setCashAccounts(accountsRes.items);
    setZReportEnabled(zEnabled);
    setMoneyAccountId(
      summaryRes.money_account_id ?? accountsRes.items[0]?.id ?? "",
    );
    if (summaryRes.summary_date) {
      setDateText(formatTrDate(summaryRes.summary_date));
    }
    setCashText(formatKurus(summaryRes.cash_kurus));
    setCardText(formatKurus(summaryRes.card_kurus));
    if (summaryRes.z_report_kurus !== null) {
      setZReportText(formatKurus(summaryRes.z_report_kurus));
    }
  }, [entityId, summaryId]);

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "Load failed"),
    );
  }, [load]);

  useEffect(() => {
    if (!summary) return;
    const canConfirm =
      summary.status === "draft" || summary.status === "needs_review";
    if (!canConfirm) return;
    window.setTimeout(() => document.getElementById("pos-date")?.focus(), 0);
  }, [summary]);

  async function onConfirm(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !summary) return;
    const salesDate = parseTrDate(dateText);
    if (!salesDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    const cashKurus = parseTryToKurus(cashText);
    const cardKurus = parseTryToKurus(cardText);
    if (cashKurus === null || cardKurus === null) {
      setError("Enter valid cash and card amounts.");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        money_account_id: moneyAccountId,
        actor_id: actorId,
        cash_kurus: cashKurus,
        card_kurus: cardKurus,
        summary_date: salesDate,
      };
      if (zReportEnabled) {
        const zKurus = parseTryToKurus(zReportText);
        if (zKurus !== null && zKurus > 0) {
          body.z_report_kurus = zKurus;
        }
      }
      const idempotencyKey = submitIdempotency.beginSubmit();
      const updated = await apiFetch<PosDailySummary>(
        `/entities/${entityId}/pos/daily-summaries/${summaryId}/confirm`,
        {
          method: "POST",
        idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      submitIdempotency.completeSubmit();
      setSummary(updated);
      onUpdated?.();
      if (updated.status === "needs_review") {
        setError(
          updated.review_reason ??
            "Daily summary needs review before posting.",
        );
        submitIdempotency.completeSubmit();
      } else {
        toast("Daily sales posted");
        router.push("/sales");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setConfirming(false);
    }
  }

  async function onReject() {
    if (!entityId || !summary) return;
    setRejecting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch<void>(
        `/entities/${entityId}/pos/daily-summaries/${summaryId}/reject`,
        {
          method: "POST",
        idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectReason || null }),
        },
      );
      submitIdempotency.completeSubmit();
      onUpdated?.();
      toast("Summary rejected");
      router.push("/sales");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setRejecting(false);
    }
  }

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar to review this summary.
      </p>
    );
  }

  if (!summary) {
    return <p className="text-sm text-muted-foreground">Loading summary…</p>;
  }

  const isTerminal =
    summary.status === "posted" || summary.status === "rejected";
  const canConfirm =
    summary.status === "draft" || summary.status === "needs_review";

  const cashKurusLive = parseTryToKurus(cashText) ?? 0;
  const cardKurusLive = parseTryToKurus(cardText) ?? 0;
  const totalKurusLive = cashKurusLive + cardKurusLive;
  const zReportKurusLive = zReportEnabled ? parseTryToKurus(zReportText) : null;
  const hasSalesInput = cashText.trim() !== "" || cardText.trim() !== "";
  const salesTotalInvalid = hasSalesInput && totalKurusLive <= 0;
  const zMismatch =
    zReportEnabled &&
    zReportKurusLive !== null &&
    zReportKurusLive > 0 &&
    cardKurusLive !== zReportKurusLive;
  const confirmBlocked =
    totalKurusLive <= 0 || !moneyAccountId || cashText.trim() === "" || cardText.trim() === "";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={summary.status} />
          {summary.summary_date && (
            <span className="text-sm text-muted-foreground">
              {formatTrDate(summary.summary_date)}
            </span>
          )}
        </div>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Cash (extracted)</dt>
            <dd className="tabular-nums">{formatTry(summary.cash_kurus)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Card (extracted)</dt>
            <dd className="tabular-nums">{formatTry(summary.card_kurus)}</dd>
          </div>
          <div className="flex justify-between font-medium">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatTry(summary.total_kurus)}</dd>
          </div>
        </dl>
        {summary.review_reason && (
          <p className="mt-3 text-sm text-warning">{summary.review_reason}</p>
        )}
        {typeof summary.extraction_payload.raw_text === "string" && (
          <pre className="mt-4 max-h-48 overflow-auto rounded-md border border-border bg-muted/30 p-2 text-xs">
            {summary.extraction_payload.raw_text}
          </pre>
        )}
      </div>

      {canConfirm && (
        <form
          onSubmit={onConfirm}
          className="rounded-lg border border-border bg-card p-4"
        >
          <h2 className="mb-3 text-sm font-semibold">Confirm & post</h2>
          <div className="space-y-3">
            <div>
              <Label htmlFor="pos-date">Date (DD.MM.YYYY)</Label>
              <DateInput
            id="pos-date"
            value={dateText}
            onChange={setDateText}
            required
          />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="pos-cash">Cash</Label>
                <MoneyInput
                  id="pos-cash"
                  value={cashText}
                  onChange={setCashText}
                  showPreview={false}
                  showInvalidHint={false}
                />
              </div>
              <div>
                <Label htmlFor="pos-card">Card</Label>
                <MoneyInput
                  id="pos-card"
                  value={cardText}
                  onChange={setCardText}
                  showPreview={false}
                  showInvalidHint={false}
                />
              </div>
            </div>
            {zReportEnabled && (
              <div>
                <Label htmlFor="pos-z">Card-terminal Z total</Label>
                <MoneyInput
                  id="pos-z"
                  value={zReportText}
                  onChange={setZReportText}
                  placeholder="0,00"
                  showPreview={false}
                  showInvalidHint={false}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  When entered, Z must match card sales or the day routes to
                  Needs Review.
                </p>
              </div>
            )}
            {hasSalesInput && (
              <ValidationHint variant={salesTotalInvalid ? "error" : "hint"}>
                {salesTotalInvalid
                  ? "Enter cash and/or card sales — total cannot be zero."
                  : `Total: ${formatTry(totalKurusLive)}`}
              </ValidationHint>
            )}
            {zMismatch && (
              <ValidationHint variant="warning">
                Z report ({formatTry(zReportKurusLive!)}) does not match card (
                {formatTry(cardKurusLive)}). The day will route to Needs Review.
              </ValidationHint>
            )}
            <div>
              <Label htmlFor="pos-drawer">Cash drawer</Label>
              <Combobox
                id="pos-drawer"
                value={moneyAccountId}
                onValueChange={setMoneyAccountId}
                options={cashAccounts.map((a) => ({
                  value: a.id,
                  label: a.name,
                }))}
                placeholder="Cash drawer…"
              />
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={confirming || confirmBlocked}>
              {confirming ? "Posting…" : "Confirm & post daily sales"}
            </Button>
            <div className="flex flex-1 flex-wrap items-end gap-2">
              <div className="min-w-[140px] flex-1">
                <Label htmlFor="pos-reject">Reject reason</Label>
                <Input
                  id="pos-reject"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={onReject}
                disabled={rejecting}
              >
                {rejecting ? "Rejecting…" : "Reject"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {isTerminal && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            This summary is {summary.status} and cannot be changed.
          </p>
          {summary.review_reason && (
            <p className="mt-2 text-sm text-warning">{summary.review_reason}</p>
          )}
        </div>
      )}
    </div>
  );
}
