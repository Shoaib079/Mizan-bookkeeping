"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { ValidationHint } from "@/components/ui/validation-hint";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";
import type { DeliveryPlatform, DeliveryReport } from "@/lib/pos-delivery-types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function DeliveryReportForm({ open, onClose, onSaved }: Props) {
  const router = useRouter();
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const [platforms, setPlatforms] = useState<DeliveryPlatform[]>([]);
  const [platformId, setPlatformId] = useState("");
  const [dateText, setDateText] = useState("");
  const [grossText, setGrossText] = useState("");
  const [commissionText, setCommissionText] = useState("");
  const [netText, setNetText] = useState("");
  const [description, setDescription] = useState("Delivery platform report");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setDateText(todayTrDate());
      void loadPlatforms().catch(() => undefined);
    }
  }, [open, loadPlatforms]);

  const grossKurus = parseTryToKurus(grossText) ?? 0;
  const commissionKurus = parseTryToKurus(commissionText) ?? 0;
  const netKurus = parseTryToKurus(netText) ?? 0;
  const mathOk =
    grossKurus > 0 && grossKurus - commissionKurus === netKurus && netKurus >= 0;
  const hasAmounts =
    grossText.trim() !== "" ||
    commissionText.trim() !== "" ||
    netText.trim() !== "";
  const submitBlocked = grossKurus <= 0 || (hasAmounts && grossKurus > 0 && !mathOk);

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
    const reportDate = parseTrDate(dateText);
    if (!reportDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (grossKurus <= 0) {
      setError("Enter gross sales.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const report = await apiFetch<DeliveryReport>(
        `/entities/${entityId}/delivery/reports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            delivery_platform_id: platformId,
            report_date: reportDate,
            gross_kurus: grossKurus,
            commission_kurus: commissionKurus,
            net_kurus: netKurus,
            description: description.trim() || "Delivery platform report",
            actor_id: actorId,
          }),
        },
      );
      onSaved?.();
      toast("Delivery report saved");
      onClose();
      setGrossText("");
      setCommissionText("");
      setNetText("");
      router.push(`/delivery/reports/${report.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Delivery platform report" onClose={onClose}>
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
        <div>
          <Label htmlFor="dr-date">Report date (DD.MM.YYYY)</Label>
          <DateInput
            id="dr-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="dr-gross">Gross</Label>
            <Input
              id="dr-gross"
              placeholder="0,00"
              value={grossText}
              onChange={(e) => setGrossText(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="dr-commission">Commission</Label>
            <Input
              id="dr-commission"
              placeholder="0,00"
              value={commissionText}
              onChange={(e) => setCommissionText(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="dr-net">Net</Label>
            <Input
              id="dr-net"
              placeholder="0,00"
              value={netText}
              onChange={(e) => setNetText(e.target.value)}
            />
          </div>
        </div>
        {hasAmounts && grossKurus > 0 && !mathOk && (
          <ValidationHint variant="error">
            Gross − commission must equal net ({formatTry(grossKurus)} −{" "}
            {formatTry(commissionKurus)} ≠ {formatTry(netKurus)}).
          </ValidationHint>
        )}
        {grossKurus > 0 && mathOk && (
          <ValidationHint variant="hint">
            Net checks out: {formatTry(grossKurus)} − {formatTry(commissionKurus)} ={" "}
            {formatTry(netKurus)}.
          </ValidationHint>
        )}
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
          {submitting ? "Saving…" : "Create report & review"}
        </Button>
      </form>
    </Dialog>
  );
}
