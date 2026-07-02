"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { RecordingForBanner } from "@/components/forms/recording-for-banner";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useRegisterUnsaved } from "@/lib/unsaved-work";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, parseTrDate, parseTryToKurus } from "@/lib/money";
import type { DeliveryPlatform, DeliveryReport } from "@/lib/pos-delivery-types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: (reportId?: string) => void;
  defaultPlatformId?: string;
  defaultPeriodFrom?: string;
  defaultPeriodTo?: string;
};

export function DeliveryReportForm({
  open,
  onClose,
  onSaved,
  defaultPlatformId,
  defaultPeriodFrom,
  defaultPeriodTo,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const [platforms, setPlatforms] = useState<DeliveryPlatform[]>([]);
  const [platformId, setPlatformId] = useState("");
  const [periodFromText, setPeriodFromText] = useState("");
  const [periodToText, setPeriodToText] = useState("");
  const [grossText, setGrossText] = useState("");
  const [description, setDescription] = useState("Delivery platform sales");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dirty = open && grossText.trim() !== "";

  useRegisterUnsaved("delivery-report", dirty, open);

  const loadPlatforms = useCallback(async () => {
    if (!entityId) return;
    const res = await apiFetch<{ items: DeliveryPlatform[] }>(
      `/entities/${entityId}/delivery/platforms?limit=50`,
    );
    const active = res.items.filter((p) => p.is_active);
    setPlatforms(active);
  }, [entityId]);

  useEffect(() => {
    if (open) {
      setPlatformId(defaultPlatformId ?? "");
      setPeriodFromText(
        defaultPeriodFrom ? formatTrDate(defaultPeriodFrom) : "",
      );
      setPeriodToText(defaultPeriodTo ? formatTrDate(defaultPeriodTo) : "");
      setGrossText("");
      setDescription("Delivery platform sales");
      setError(null);
      void loadPlatforms().catch(() => undefined);
    }
  }, [open, loadPlatforms, defaultPlatformId, defaultPeriodFrom, defaultPeriodTo]);

  const grossKurus = parseTryToKurus(grossText) ?? 0;
  const submitBlocked = grossKurus <= 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    if (!platformId) {
      setError("Choose a delivery platform.");
      return;
    }
    const periodStart = parseTrDate(periodFromText);
    const periodEnd = parseTrDate(periodToText);
    if (!periodStart || !periodEnd) {
      setError("Enter valid period dates (DD.MM.YYYY).");
      return;
    }
    if (periodStart > periodEnd) {
      setError("Period start must be on or before period end.");
      return;
    }
    if (grossKurus <= 0) {
      setError("Enter total sales for the period (KDV dahil).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const report = await apiFetch<DeliveryReport>(
        `/entities/${entityId}/delivery/reports`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            delivery_platform_id: platformId,
            period_start: periodStart,
            period_end: periodEnd,
            gross_kurus: grossKurus,
            description: description.trim() || "Delivery platform sales",
            actor_id: actorId,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      onSaved?.(report.id);
      toast("Sales saved — confirm and post below");
      onClose();
      setGrossText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Record platform sales" onClose={onClose}>
      <RecordingForBanner />
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="dr-platform">Platform</Label>
          <Combobox
            id="dr-platform"
            value={platformId}
            onValueChange={setPlatformId}
            options={
              platforms.length === 0
                ? [{ value: "", label: "No active platforms" }]
                : platforms.map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))
            }
            placeholder="Choose platform…"
            required
            disabled={platforms.length === 0}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="dr-from">Period from</Label>
            <DateInput
              id="dr-from"
              value={periodFromText}
              onChange={setPeriodFromText}
              required
            />
          </div>
          <div>
            <Label htmlFor="dr-to">Period to</Label>
            <DateInput
              id="dr-to"
              value={periodToText}
              onChange={setPeriodToText}
              required
            />
          </div>
        </div>
        <div>
          <Label htmlFor="dr-gross">Total sales (KDV dahil)</Label>
          <MoneyInput
            id="dr-gross"
            placeholder="0,00"
            value={grossText}
            onChange={setGrossText}
            showPreview
          />
        </div>
        <div>
          <Label htmlFor="dr-desc">Description</Label>
          <Input
            id="dr-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting || submitBlocked}>
          {submitting ? "Saving…" : "Save & review"}
        </Button>
      </form>
    </Dialog>
  );
}
