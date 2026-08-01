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
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
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
      setNetAgainstDrawings(true);
      setPreview(null);
      setError(null);
    }
  }, [open, submitIdempotency]);

  const buildProfitPayload = useCallback(() => {
    const profitKurus = parseTryToKurus(amountText);
    const periodFrom = parseTrDate(periodFromText);
    const periodTo = parseTrDate(periodToText);
    if (profitKurus !== null && profitKurus > 0) {
      return { profit_kurus: profitKurus };
    }
    if (periodFrom && periodTo) {
      return { period_from: periodFrom, period_to: periodTo };
    }
    return null;
  }, [amountText, periodFromText, periodToText]);

  async function loadPreview() {
    if (!entityId) return;
    const profitPayload = buildProfitPayload();
    if (!profitPayload) {
      setError("Enter a profit amount or a valid period (from and to dates).");
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

  return (
    <Dialog open={open} title="Allocate profit to partners" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="alloc-date">Allocation date</Label>
          <DateInput
            id="alloc-date"
            value={allocationDateText}
            onChange={setAllocationDateText}
          />
        </div>

        <p className="text-sm text-muted-foreground">
          Dr Retained earnings (3100), Cr Partner capital (3300) per ownership
          share. Review the split before confirming.
        </p>

        <div>
          <Label htmlFor="alloc-amount">Profit amount (TRY)</Label>
          <MoneyInput
            id="alloc-amount"
            value={amountText}
            onChange={setAmountText}
            placeholder="Or use period below"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="period-from">Period from (optional)</Label>
            <DateInput
              id="period-from"
              value={periodFromText}
              onChange={setPeriodFromText}
            />
          </div>
          <div>
            <Label htmlFor="period-to">Period to (optional)</Label>
            <DateInput
              id="period-to"
              value={periodToText}
              onChange={setPeriodToText}
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
            Net against amount already taken — reduce each partner&apos;s share when
            their net balance is negative (drawings exceed fronted expenses).
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
          <div className="rounded-lg border border-border">
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
                        <DataTableCell align="right" className="tabular-nums">
                          {formatTry(line.gross_amount_kurus)}
                        </DataTableCell>
                        <DataTableCell align="right" className="tabular-nums">
                          {line.offset_kurus > 0
                            ? `−${formatTry(line.offset_kurus)}`
                            : "—"}
                        </DataTableCell>
                      </>
                    )}
                    <DataTableCell align="right" className="tabular-nums">
                      {formatTry(line.amount_kurus)}
                    </DataTableCell>
                  </DataTableRow>
                ))}
                <DataTableRow>
                  <DataTableCell className="font-medium">Total</DataTableCell>
                  <DataTableCell>{""}</DataTableCell>
                  {preview.net_against_drawings && (
                    <>
                      <DataTableCell align="right" className="font-medium tabular-nums">
                        {formatTry(preview.total_profit_kurus)}
                      </DataTableCell>
                      <DataTableCell>{""}</DataTableCell>
                    </>
                  )}
                  <DataTableCell align="right" className="font-medium tabular-nums">
                    {formatTry(preview.total_allocated_kurus)}
                  </DataTableCell>
                </DataTableRow>
              </DataTableBody>
            </DataTable>
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
