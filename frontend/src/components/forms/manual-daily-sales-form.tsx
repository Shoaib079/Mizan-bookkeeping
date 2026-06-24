"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { isEntitySettingEnabled } from "@/lib/entity-settings";
import { useEntity } from "@/lib/entity-context";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";

type MoneyAccount = { id: string; name: string };

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
    if (accountsRes.items[0]) setMoneyAccountId(accountsRes.items[0].id);
  }, [entityId]);

  useEffect(() => {
    if (open) void loadOptions().catch(() => undefined);
  }, [open, loadOptions]);

  const cashKurus = parseTryToKurus(cashText) ?? 0;
  const cardKurus = parseTryToKurus(cardText) ?? 0;
  const totalKurus = cashKurus + cardKurus;
  const zReportKurus = zReportEnabled ? parseTryToKurus(zReportText) : null;

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

      const result = await apiFetch<ManualDailySalesResponse>(
        `/entities/${entityId}/pos/manual-daily-sales`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (result.status === "needs_review") {
        const reason =
          result.review_reason ??
          "Daily sales need review before they can post to the ledger.";
        setError(
          `${reason} Fix the figures here, or open the Sales list to finish review.`,
        );
        setShowSalesHint(true);
        return;
      }

      if (result.status !== "posted") {
        setError(
          `Unexpected status "${result.status}". Check the Sales list (/sales) before posting again.`,
        );
        return;
      }

      onClose();
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
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="sales-date">Date (DD.MM.YYYY)</Label>
          <Input
            id="sales-date"
            placeholder="23.06.2026"
            value={dateText}
            onChange={(e) => setDateText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="sales-cash">Cash sales</Label>
          <Input
            id="sales-cash"
            placeholder="0,00"
            value={cashText}
            onChange={(e) => setCashText(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="sales-card">Card sales</Label>
          <Input
            id="sales-card"
            placeholder="0,00"
            value={cardText}
            onChange={(e) => setCardText(e.target.value)}
          />
        </div>
        {zReportEnabled && (
          <div>
            <Label htmlFor="sales-z">Card-terminal Z report total (optional)</Label>
            <Input
              id="sales-z"
              placeholder="0,00"
              value={zReportText}
              onChange={(e) => setZReportText(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              When entered, Z must match card sales or the day routes to Needs
              Review.
            </p>
          </div>
        )}
        {totalKurus > 0 && (
          <p className="text-xs text-muted-foreground">
            Total: {formatTry(totalKurus)} (cash + card must match)
          </p>
        )}
        <div>
          <Label htmlFor="sales-drawer">Cash drawer</Label>
          <Select
            id="sales-drawer"
            value={moneyAccountId}
            onChange={(e) => setMoneyAccountId(e.target.value)}
          >
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
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
        <Button type="submit" disabled={submitting}>
          {submitting ? "Posting…" : "Post daily sales"}
        </Button>
      </form>
    </Dialog>
  );
}
