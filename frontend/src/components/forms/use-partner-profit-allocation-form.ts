"use client";

/** State, preview, and submit for PartnerProfitAllocationForm. */

import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  buildPartnerProfitPayload,
  partnerProfitSourceBanner,
} from "@/components/forms/partner-profit-allocation-helpers";
import type { PartnerProfitPreviewResponse } from "@/components/forms/partner-profit-allocation-types";
import { apiFetch } from "@/lib/api";
import { todayTrDate } from "@/lib/dates";
import { useEntity } from "@/lib/entity-context";
import { parseTrDate } from "@/lib/money";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export type UsePartnerProfitAllocationFormArgs = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function usePartnerProfitAllocationForm({
  open,
  onClose,
  onSaved,
}: UsePartnerProfitAllocationFormArgs) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const [allocationDateText, setAllocationDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [periodFromText, setPeriodFromText] = useState("");
  const [periodToText, setPeriodToText] = useState("");
  const [description, setDescription] = useState("");
  const [netAgainstDrawings, setNetAgainstDrawings] = useState(true);
  const [preview, setPreview] = useState<PartnerProfitPreviewResponse | null>(
    null,
  );
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

  const buildProfitPayload = useCallback(
    () =>
      buildPartnerProfitPayload({
        amountText,
        periodFromText,
        periodToText,
      }),
    [amountText, periodFromText, periodToText],
  );

  async function loadPreview() {
    if (!entityId) return;
    const profitPayload = buildProfitPayload();
    if (profitPayload === "incomplete_period") {
      setError("Set both period from and to, or leave both blank.");
      setPreview(null);
      return;
    }
    if (!profitPayload) {
      setError(
        "Enter a profit amount, or a period from and to (for full period P&L).",
      );
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
      const body = await apiFetch<PartnerProfitPreviewResponse>(
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
      ? partnerProfitSourceBanner(currentPayload, preview.total_profit_kurus)
      : null;

  function clearPreview() {
    setPreview(null);
  }

  return {
    allocationDateText,
    setAllocationDateText,
    amountText,
    setAmountText,
    periodFromText,
    setPeriodFromText,
    periodToText,
    setPeriodToText,
    description,
    setDescription,
    netAgainstDrawings,
    setNetAgainstDrawings,
    preview,
    previewLoading,
    error,
    submitting,
    sourceBanner,
    clearPreview,
    loadPreview,
    onSubmit,
  };
}
