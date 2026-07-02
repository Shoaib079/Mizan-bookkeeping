"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import {
  formatKurus,
  formatTrDate,
  formatTry,
  parseTryToKurus,
} from "@/lib/money";
import type { DeliveryReport } from "@/lib/pos-delivery-types";

import { formatDeliveryPeriod } from "@/lib/delivery-period";

type Props = {
  reportId: string;
  onUpdated?: () => void;
};

export function DeliveryReportReview({ reportId, onUpdated }: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const [report, setReport] = useState<DeliveryReport | null>(null);
  const [grossText, setGrossText] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) return;
    const res = await apiFetch<DeliveryReport>(
      `/entities/${entityId}/delivery/reports/${reportId}`,
    );
    setReport(res);
    setGrossText(formatKurus(res.gross_kurus));
  }, [entityId, reportId]);

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "Load failed"),
    );
  }, [load]);

  useEffect(() => {
    if (!report) return;
    const canPost =
      report.status === "draft" || report.status === "needs_review";
    if (!canPost) return;
    window.setTimeout(() => document.getElementById("rep-gross")?.focus(), 0);
  }, [report]);

  async function onPost(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !report) return;
    const grossKurus = parseTryToKurus(grossText);
    if (grossKurus === null || grossKurus <= 0) {
      setError("Enter valid gross sales.");
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const updated = await apiFetch<DeliveryReport>(
        `/entities/${entityId}/delivery/reports/${reportId}/post`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actor_id: actorId,
            gross_kurus: grossKurus,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      setReport(updated);
      onUpdated?.();
      toast("Platform sales posted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post failed");
    } finally {
      setPosting(false);
    }
  }

  async function onReject() {
    if (!entityId || !report) return;
    setRejecting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const updated = await apiFetch<DeliveryReport>(
        `/entities/${entityId}/delivery/reports/${reportId}/reject?reason=${encodeURIComponent(rejectReason)}`,
        { method: "POST", idempotencyKey },
      );
      submitIdempotency.completeSubmit();
      setReport(updated);
      onUpdated?.();
      toast("Platform sales entry rejected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setRejecting(false);
    }
  }

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar to review this entry.
      </p>
    );
  }

  if (!report) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const canPost =
    report.status === "draft" || report.status === "needs_review";
  const isTerminal =
    report.status === "posted" || report.status === "rejected";
  const periodLabel = formatDeliveryPeriod(report);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={report.status} />
        <span className="text-sm font-medium">{report.platform_name}</span>
        <span className="text-sm text-muted-foreground">{periodLabel}</span>
        <span className="text-xs text-muted-foreground">
          Ledger date {formatTrDate(report.report_date)}
        </span>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">{report.description}</h2>
        <p className="text-xs text-muted-foreground">
          Gross sales are KDV dahil — output VAT split is deferred.
        </p>
        {report.review_reason && (
          <p className="mt-2 text-sm text-warning">{report.review_reason}</p>
        )}
      </div>

      {canPost && (
        <form
          onSubmit={onPost}
          className="rounded-lg border border-border bg-card p-4"
        >
          <h2 className="mb-3 text-sm font-semibold">Confirm & post</h2>
          <div>
            <Label htmlFor="rep-gross">Total sales (KDV dahil)</Label>
            <MoneyInput
              id="rep-gross"
              value={grossText}
              onChange={setGrossText}
              showPreview
            />
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={posting}>
              {posting ? "Posting…" : "Post to clearing & revenue"}
            </Button>
            <div className="flex flex-1 flex-wrap items-end gap-2">
              <div className="min-w-[140px] flex-1">
                <Label htmlFor="rep-reject">Reject reason</Label>
                <Input
                  id="rep-reject"
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
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between font-medium">
              <dt>Gross sales</dt>
              <dd className="tabular-nums">{formatTry(report.gross_kurus)}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
