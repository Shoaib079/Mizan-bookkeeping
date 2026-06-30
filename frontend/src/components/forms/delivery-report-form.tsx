"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { RecordingForBanner } from "@/components/forms/recording-for-banner";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useRegisterUnsaved } from "@/lib/unsaved-work";
import { useEntity } from "@/lib/entity-context";
import { parseTryToKurus } from "@/lib/money";
import type { DeliveryPlatform, DeliveryReport } from "@/lib/pos-delivery-types";

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function DeliveryReportForm({ open, onClose, onSaved }: Props) {
  const router = useRouter();
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const now = new Date();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const [platforms, setPlatforms] = useState<DeliveryPlatform[]>([]);
  const [platformId, setPlatformId] = useState("");
  const [periodYear, setPeriodYear] = useState(String(now.getFullYear()));
  const [periodMonth, setPeriodMonth] = useState(String(now.getMonth() + 1));
  const [grossText, setGrossText] = useState("");
  const [description, setDescription] = useState("Delivery platform monthly sales");
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
    if (active[0]) setPlatformId(active[0].id);
  }, [entityId]);

  useEffect(() => {
    if (open) {
      void loadPlatforms().catch(() => undefined);
    }
  }, [open, loadPlatforms]);

  const grossKurus = parseTryToKurus(grossText) ?? 0;
  const submitBlocked = grossKurus <= 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    if (!platformId) {
      setError("Add a delivery platform first.");
      return;
    }
    const year = Number.parseInt(periodYear, 10);
    const month = Number.parseInt(periodMonth, 10);
    if (!Number.isFinite(year) || year < 2020) {
      setError("Enter a valid year.");
      return;
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      setError("Select a valid month.");
      return;
    }
    if (grossKurus <= 0) {
      setError("Enter total monthly sales (KDV dahil).");
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
            period_year: year,
            period_month: month,
            gross_kurus: grossKurus,
            description: description.trim() || "Delivery platform monthly sales",
            actor_id: actorId,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("Monthly sales saved — confirm and post on review");
      onClose();
      setGrossText("");
      router.push(`/delivery/reports/${report.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Monthly platform sales" onClose={onClose}>
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
            placeholder="Platform…"
            disabled={platforms.length === 0}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="dr-month">Month</Label>
            <Select
              id="dr-month"
              value={periodMonth}
              onChange={(e) => setPeriodMonth(e.target.value)}
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="dr-year">Year</Label>
            <Input
              id="dr-year"
              inputMode="numeric"
              value={periodYear}
              onChange={(e) => setPeriodYear(e.target.value)}
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
