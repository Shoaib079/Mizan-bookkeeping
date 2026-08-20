"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { todayTrDate } from "@/lib/dates";
import { useEntity } from "@/lib/entity-context";
import { formatTry, parseTrDate, parseTryToKurus, formatTrDate } from "@/lib/money";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

type PreviewLine = {
  partner_id: string;
  partner_name: string;
  ownership_share_pct: string;
  amount_kurus: number;
  gross_amount_kurus: number;
  net_balance_before_kurus: number;
  offset_kurus: number;
};

type PreviewResponse = {
  total_profit_kurus: number;
  total_allocated_kurus: number;
  net_against_drawings: boolean;
  netting_as_of?: string | null;
  lines: PreviewLine[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function PartnerProfitAllocationForm({ open, onClose, onSaved }: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const [allocationDateText, setAllocationDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [periodFromText, setPeriodFromText] = useState("");
  const [periodToText, setPeriodToText] = useState("");
  const [description, setDescription] = useState("Partner profit allocation");
  const [netAgainstDrawings, setNetAgainstDrawings] = useState(true);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      submitIdempotency.resetSubmit();
      setAllocationDateText(todayTrDate());
      setAmountText("");
      setPeriodFromText("");
      setPeriodToText("");
      setNetAgainstDrawings(true);
      setPreview(null);
      setError(null);
    }
  }, [open, submitIdempotency]);

  const buildProfitPayload = useCallback(() => {
    const profitKurus = parseTryToKurus(amountText);
    const periodFrom = parseTrDate(periodFromText);
    const periodTo = parseTrDate(periodToText);
    const payload: {
      profit_kurus?: number;
      period_from?: string;
      period_to?: string;
    } = {};
    if (profitKurus !== null && profitKurus > 0) {
      payload.profit_kurus = profitKurus;
    }
    if (periodFrom && periodTo) {
      payload.period_from = periodFrom;
      payload.period_to = periodTo;
    } else if (periodFrom || periodTo) {
      return "incomplete_period" as const;
    }
    if (!payload.profit_kurus && !(payload.period_from && payload.period_to)) {
      return null;
    }
    return payload;
  }, [amountText, periodFromText, periodToText]);

  function profitSourceBanner(
    payload: { profit_kurus?: number; period_from?: string; period_to?: string },
    previewTotal: number,
  ): string {
    if (payload.profit_kurus != null) {
      const periodNote =
        payload.period_from && payload.period_to
          ? ` Period ${formatTrDate(payload.period_from)}–${formatTrDate(payload.period_to)} only sets which drawings to net — it does not change this amount.`
          : "";
      return `Distributing your amount of ${formatTry(payload.profit_kurus)}.${periodNote}`;
    }
    return `Distributing the period’s net profit of ${formatTry(previewTotal)} (no amount typed).`;
  }

  async function loadPreview() {
    if (!entityId) return;
    const profitPayload = buildProfitPayload();
    if (profitPayload === "incomplete_period") {
      setError("Set both period from and to, or leave both blank.");
      setPreview(null);
      return;
    }
    if (!profitPayload) {
      setError("Enter a profit amount, or a period from and to (for full period P&L).");
      setPreview(null);
      return;
    }
    const allocationDate = parseTrDate(allocationDateText);
    const periodTo = parseTrDate(periodToText);
    if (!periodTo && !allocationDate) {
      setError("Set allocation date or period to before previewing.");
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    setError(null);
    try {
      const body = await apiFetch<PreviewResponse>(
        `/entities/${entityId}/partners/profit-allocation/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...profitPayload,
            allocation_date: allocationDate ?? undefined,
            net_against_drawings: netAgainstDrawings,
          }),
        },
      );
      setPreview(body);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const allocationDate = parseTrDate(allocationDateText);
    if (!allocationDate) {
      setError("Allocation date must be DD.MM.YYYY.");
      return;
    }
    const profitPayload = buildProfitPayload();
    if (profitPayload === "incomplete_period") {
      setError("Set both period from and to, or leave both blank.");
      return;
    }
    if (!profitPayload) {
      setError("Enter a profit amount or a valid period.");
      return;
    }
    if (!preview) {
      setError("Review the preview before confirming.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(`/entities/${entityId}/partners/profit-allocation`, {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocation_date: allocationDate,
          description: description.trim(),
          actor_id: actorId,
          net_against_drawings: netAgainstDrawings,
          ...profitPayload,
        }),
      });
      submitIdempotency.completeSubmit();
      toast("Profit allocated to partners");
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Allocation failed");
    } finally {
      setSubmitting(false);
    }
  }

  const currentPayload = buildProfitPayload();
  const sourceBanner =
    preview &&
    currentPayload &&
    currentPayload !== "incomplete_period"
      ? profitSourceBanner(currentPayload, preview.total_profit_kurus)
      : null;

  return (
    // `wide`: the preview is a five-column money table, and at the default
    // width the Allocate column fell off the edge — the one figure you open
    // this to check before confirming.
    <Dialog
      open={open}
      title="Allocate profit to partners"
      size="wide"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="alloc-date">Allocation date</Label>
          <DateInput
            id="alloc-date"
            value={allocationDateText}
            onChange={(v) => {
              setAllocationDateText(v);
              setPreview(null);
            }}
          />
        </div>

        <p className="text-sm text-muted-foreground">
          Type how much to distribute. Optional period only decides which
          drawings to net against — it never replaces your amount. Leave the
          amount blank to distribute the period’s full net profit instead.
        </p>

        <div>
          <Label htmlFor="alloc-amount">Profit amount (TRY)</Label>
          <MoneyInput
            id="alloc-amount"
            value={amountText}
            onChange={(v) => {
              setAmountText(v);
              setPreview(null);
            }}
            placeholder="How much to allocate"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="period-from">Period from (drawings cutoff)</Label>
            <DateInput
              id="period-from"
              value={periodFromText}
              onChange={(v) => {
                setPeriodFromText(v);
                setPreview(null);
              }}
            />
          </div>
          <div>
            <Label htmlFor="period-to">Period to</Label>
            <DateInput
              id="period-to"
              value={periodToText}
              onChange={(v) => {
                setPeriodToText(v);
                setPreview(null);
              }}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="alloc-desc">Description</Label>
          <Input
            id="alloc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={netAgainstDrawings}
            onChange={(e) => {
              setNetAgainstDrawings(e.target.checked);
              setPreview(null);
            }}
          />
          <span>
            Net against amount already taken — settle each partner&apos;s share of
            profit against their net balance (drawings, partner-paid expenses, loans) on
            or before the profit period end, or the allocation date when using a
            fixed amount. Movements after that date are ignored so later drawings
            stay separate.
          </span>
        </label>

        <Button
          type="button"
          variant="secondary"
          disabled={previewLoading}
          onClick={() => void loadPreview()}
        >
          {previewLoading ? "Loading preview…" : "Preview split"}
        </Button>

        {preview && (
          <div className="space-y-2">
            {sourceBanner && (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                {sourceBanner}
              </p>
            )}
            {preview.netting_as_of && preview.net_against_drawings && (
              <p className="text-xs text-muted-foreground">
                Netting uses partner balances on or before{" "}
                {formatTrDate(preview.netting_as_of)}.
              </p>
            )}
            {/* Scrolls rather than clips where the width still is not enough
                — a phone dialog is full-screen at every size, and the money
                columns no longer wrap to make themselves fit. */}
            <div className="overflow-x-auto rounded-lg border border-border">
            <DataTable>
              <DataTableHead>
                <DataTableRow>
                  <DataTableHeaderCell>Partner</DataTableHeaderCell>
                  <DataTableHeaderCell>Share</DataTableHeaderCell>
                  {preview.net_against_drawings && (
                    <>
                      <DataTableHeaderCell align="right">Gross</DataTableHeaderCell>
                      <DataTableHeaderCell align="right">Offset</DataTableHeaderCell>
                    </>
                  )}
                  <DataTableHeaderCell align="right">Allocate</DataTableHeaderCell>
                </DataTableRow>
              </DataTableHead>
              <DataTableBody>
                {preview.lines.map((line) => (
                  <DataTableRow key={line.partner_id}>
                    <DataTableCell>{line.partner_name}</DataTableCell>
                    <DataTableCell>{line.ownership_share_pct}%</DataTableCell>
                    {preview.net_against_drawings && (
                      <>
                        <DataTableCell align="right" className="whitespace-nowrap tabular-nums">
                          {formatTry(line.gross_amount_kurus)}
                        </DataTableCell>
                        <DataTableCell align="right" className="whitespace-nowrap tabular-nums">
                          {line.offset_kurus > 0
                            ? `−${formatTry(line.offset_kurus)}`
                            : "—"}
                        </DataTableCell>
                      </>
                    )}
                    <DataTableCell align="right" className="whitespace-nowrap tabular-nums">
                      {formatTry(line.amount_kurus)}
                    </DataTableCell>
                  </DataTableRow>
                ))}
                <DataTableRow>
                  <DataTableCell className="font-medium">Total</DataTableCell>
                  <DataTableCell>{""}</DataTableCell>
                  {preview.net_against_drawings && (
                    <>
                      <DataTableCell align="right" className="whitespace-nowrap font-medium tabular-nums">
                        {formatTry(preview.total_profit_kurus)}
                      </DataTableCell>
                      <DataTableCell>{""}</DataTableCell>
                    </>
                  )}
                  <DataTableCell align="right" className="whitespace-nowrap font-medium tabular-nums">
                    {formatTry(preview.total_allocated_kurus)}
                  </DataTableCell>
                </DataTableRow>
              </DataTableBody>
            </DataTable>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !preview}>
            {submitting ? "Posting…" : "Confirm allocation"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
