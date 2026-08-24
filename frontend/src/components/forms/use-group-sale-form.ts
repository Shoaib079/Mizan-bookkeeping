"use client";

/** State, load/hydrate, parse, and submit for GroupSaleForm. */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import type { CustomerRow } from "@/components/forms/customer-form";
import {
  type GroupSaleLineDraft,
  type ParsedGroupSaleLine,
  minorToText,
  newGroupSaleLine,
  parseRateMinor,
} from "@/components/forms/group-sale-line-helpers";
import { apiFetch } from "@/lib/api";
import { withAcknowledgeDuplicate } from "@/lib/duplicate-record";
import { todayTrDate } from "@/lib/dates";
import { useEntity } from "@/lib/entity-context";
import {
  groupSaleDescriptionForSubmit,
  groupSaleNoteFromSaved,
} from "@/lib/group-sale-form-copy";
import type { GroupMenuRow, GroupSaleRead } from "@/lib/group-sales-types";
import { FOREX_CURRENCIES } from "@/lib/group-sales-types";
import { formatTrDate, parseTrDate, parseTryToKurus } from "@/lib/money";
import { useDuplicateRecordSubmit } from "@/lib/use-duplicate-record-submit";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export type UseGroupSaleFormArgs = {
  open: boolean;
  onClose: () => void;
  customerId?: string;
  correcting?: GroupSaleRead | null;
  onSaved?: () => void;
};

export function useGroupSaleForm({
  open,
  onClose,
  customerId,
  correcting,
  onSaved,
}: UseGroupSaleFormArgs) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithDuplicateGuard, DuplicateRecordDialog } =
    useDuplicateRecordSubmit();
  const isCorrect = Boolean(correcting);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const [menus, setMenus] = useState<GroupMenuRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId ?? "");
  const [dateText, setDateText] = useState("");
  const [currency, setCurrency] = useState("TRY");
  const [fxRateText, setFxRateText] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<GroupSaleLineDraft[]>([newGroupSaleLine()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadMenus = useCallback(async () => {
    if (!entityId) return;
    const res = await apiFetch<{ items: GroupMenuRow[] }>(
      `/entities/${entityId}/group-menus?include_inactive=false&limit=100`,
    );
    setMenus(res.items);
  }, [entityId]);

  const loadCustomers = useCallback(async () => {
    if (!entityId || customerId) return;
    const res = await apiFetch<{ items: CustomerRow[] }>(
      `/entities/${entityId}/customers?include_inactive=false&limit=200`,
    );
    setCustomers(res.items);
    setSelectedCustomerId((prev) => prev || res.items[0]?.id || "");
  }, [entityId, customerId]);

  useEffect(() => {
    if (customerId) setSelectedCustomerId(customerId);
  }, [customerId]);

  useEffect(() => {
    if (!open) return;
    void loadMenus().catch(() => undefined);
    void loadCustomers().catch(() => undefined);
    if (correcting) {
      setDateText(formatTrDate(correcting.sale_date));
      setCurrency(correcting.currency);
      setNote(groupSaleNoteFromSaved(correcting.description));
      setFxRateText(
        correcting.fx_rate_used != null
          ? (correcting.fx_rate_used / 100).toFixed(2).replace(".", ",")
          : "",
      );
      setLines(
        correcting.lines.map((line) => ({
          key: line.id,
          group_menu_id: line.group_menu_id,
          menu_name: line.menu_name_snapshot,
          paxText: String(line.pax),
          // Reopened by total when the stored line does not divide evenly:
          // showing the rounded rate and re-posting it would turn 94,00 into
          // 94,02 on every correction.
          ...(line.rate_per_person_minor * line.pax === line.line_total_minor
            ? {
                rateText: minorToText(
                  line.rate_per_person_minor,
                  correcting.currency,
                ),
                totalText: "",
              }
            : {
                rateText: "",
                totalText: minorToText(
                  line.line_total_minor,
                  correcting.currency,
                ),
              }),
        })),
      );
    } else {
      setDateText(todayTrDate());
      setCurrency("TRY");
      setFxRateText("");
      setNote("");
      setLines([newGroupSaleLine()]);
    }
    setError(null);
  }, [open, correcting, loadMenus, loadCustomers]);

  const isForex = currency !== "TRY";
  const fxRateKurus = parseTryToKurus(fxRateText);
  const hasSaleDateRate = fxRateKurus !== null && fxRateKurus > 0;

  const parsedLines = useMemo((): ParsedGroupSaleLine[] => {
    return lines.map((line) => {
      const pax = Number.parseInt(line.paxText.trim(), 10);
      const validPax = Number.isFinite(pax) && pax > 0;

      const typedRate = parseRateMinor(currency, line.rateText);
      const typedTotal = parseRateMinor(currency, line.totalText);
      const hasRate = typedRate !== null && typedRate > 0;
      const hasTotal = typedTotal !== null && typedTotal > 0;

      // The total is exact; the rate derived from it is rounded and shown for
      // reference only. 94,00 over 6 posts 94,00, not the 94,02 that storing
      // 15,67 and multiplying would give. Mirrors _rate_per_person_minor on
      // the API — half up, on integers, never through a float.
      const lineTotalMinor = hasTotal
        ? typedTotal
        : validPax && hasRate
          ? pax * typedRate
          : null;
      const rate = hasRate
        ? typedRate
        : validPax && hasTotal
          ? Math.floor((typedTotal * 2 + pax) / (pax * 2))
          : null;

      return {
        ...line,
        pax: validPax ? pax : null,
        rate,
        lineTotalMinor,
        pricedBy: hasTotal ? ("total" as const) : hasRate ? ("rate" as const) : null,
      };
    });
  }, [lines, currency]);

  const totalMinor = useMemo(() => {
    if (parsedLines.some((l) => l.lineTotalMinor === null)) return null;
    return parsedLines.reduce((sum, l) => sum + (l.lineTotalMinor ?? 0), 0);
  }, [parsedLines]);

  const totalTryPreview = useMemo(() => {
    if (totalMinor === null) return null;
    if (!isForex) return totalMinor;
    if (fxRateKurus === null || fxRateKurus <= 0) return null;
    return Math.round((totalMinor * fxRateKurus) / 100);
  }, [totalMinor, isForex, fxRateKurus]);

  const currencyOptions = [
    { value: "TRY", label: "TRY (₺)" },
    ...FOREX_CURRENCIES.map((c) => ({ value: c, label: c })),
  ];

  const customerOptions = customers.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  function updateLine(key: string, patch: Partial<GroupSaleLineDraft>) {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    setLines((prev) => [...prev, newGroupSaleLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const resolvedCustomerId = customerId ?? selectedCustomerId;
    if (!resolvedCustomerId) {
      setError("Choose an agency.");
      return;
    }
    const saleDate = parseTrDate(dateText);
    if (!saleDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    const apiLines = parsedLines.map((line) => {
      if (line.pax === null || line.pricedBy === null) {
        throw new Error("Each line needs pax and either a rate or a total.");
      }
      const menuName =
        line.menu_name.trim() ||
        menus.find((m) => m.id === line.group_menu_id)?.name ||
        "";
      if (!menuName && !line.group_menu_id) {
        throw new Error("Each line needs a menu.");
      }
      return {
        group_menu_id: line.group_menu_id,
        menu_name: menuName || undefined,
        pax: line.pax,
        // Exactly one, as the API requires. Sending the total keeps it exact.
        ...(line.pricedBy === "total"
          ? { line_total_minor: line.lineTotalMinor! }
          : { rate_per_person_minor: line.rate! }),
      };
    });

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        customer_id: resolvedCustomerId,
        sale_date: saleDate,
        description: groupSaleDescriptionForSubmit(note),
        currency,
        lines: apiLines,
        actor_id: actorId,
        fx_rate_used:
          isForex && hasSaleDateRate ? fxRateKurus : undefined,
      };
      const idempotencyKey = submitIdempotency.beginSubmit();
      if (isCorrect && correcting) {
        await apiFetch(
          `/entities/${entityId}/group-sales/${correcting.id}/correct`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        toast("Group sale corrected");
      } else {
        await submitWithDuplicateGuard(async (acknowledgedDuplicate) =>
          apiFetch(`/entities/${entityId}/group-sales`, {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withAcknowledgeDuplicate(payload, acknowledgedDuplicate),
            ),
          }),
        );
        toast("Group sale recorded");
      }
      submitIdempotency.completeSubmit();
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const title = isCorrect ? "Correct group sale" : "Record group sale";

  return {
    DuplicateRecordDialog,
    title,
    isCorrect,
    customerId,
    dateText,
    setDateText,
    selectedCustomerId,
    setSelectedCustomerId,
    customerOptions,
    currency,
    setCurrency,
    currencyOptions,
    isForex,
    fxRateText,
    setFxRateText,
    hasSaleDateRate,
    fxRateKurus,
    menus,
    lines,
    parsedLines,
    updateLine,
    addLine,
    removeLine,
    totalMinor,
    totalTryPreview,
    note,
    setNote,
    error,
    submitting,
    onSubmit,
  };
}
