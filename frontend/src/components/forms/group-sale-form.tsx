"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ValidationHint } from "@/components/ui/validation-hint";
import { apiFetch } from "@/lib/api";
import { withAcknowledgeDuplicate } from "@/lib/duplicate-record";
import { todayTrDate } from "@/lib/dates";
import { useEntity } from "@/lib/entity-context";
import { formatFxNative, parseFxNative } from "@/lib/fx-money";
import type { CustomerRow } from "@/components/forms/customer-form";
import type { GroupMenuRow, GroupSaleRead } from "@/lib/group-sales-types";
import { menuPriceNote } from "@/lib/menu-prefill";
import { FOREX_CURRENCIES } from "@/lib/group-sales-types";
import {
  bookingTotalLabel,
  forexFooterSuffix,
  fxRateFieldLabel,
  fxRateHelperText,
  groupSaleDescriptionForSubmit,
  groupSaleNoteFromSaved,
  GROUP_SALE_NOTE_PLACEHOLDER,
  ratePerPersonLabel,
} from "@/lib/group-sale-form-copy";
import { GroupSaleMenuPicker } from "@/components/forms/group-sale-menu-picker";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useDuplicateRecordSubmit } from "@/lib/use-duplicate-record-submit";
import { useToast } from "@/lib/toast";
import { formatTry, formatTrDate, parseTrDate, parseTryToKurus } from "@/lib/money";

type LineDraft = {
  key: string;
  group_menu_id: string | null;
  menu_name: string;
  paxText: string;
  /** Either of these, never both — whichever you fill drives the other. */
  rateText: string;
  totalText: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** When omitted, agency is chosen inside the form. */
  customerId?: string;
  /** When set, void-and-repost via correct endpoint. */
  correcting?: GroupSaleRead | null;
  embedded?: boolean;
  onSaved?: () => void;
};

function newLine(): LineDraft {
  return {
    key: crypto.randomUUID(),
    group_menu_id: null,
    menu_name: "",
    paxText: "",
    rateText: "",
    totalText: "",
  };
}

/** The rate implied by a typed total — rounded, shown for reference. `≈` when
 * it does not divide evenly, because the figure that posts is the total. */
function derivedRateText(
  parsed: { rate: number | null; pax: number | null; lineTotalMinor: number | null },
  currency: string,
): string {
  if (parsed?.rate == null) return "";
  const exact =
    parsed.pax != null && parsed.rate * parsed.pax === parsed.lineTotalMinor;
  return `${exact ? "" : "≈ "}${minorToText(parsed.rate, currency)}`;
}

/** The total implied by a typed rate. Always exact — it is pax × rate. */
function derivedTotalText(
  parsed: { lineTotalMinor: number | null },
  currency: string,
): string {
  if (parsed?.lineTotalMinor == null) return "";
  return minorToText(parsed.lineTotalMinor, currency);
}

function minorToText(minor: number, currency: string): string {
  if (currency === "TRY") return (minor / 100).toFixed(2).replace(".", ",");
  return formatFxNative(minor, currency).replace(/[^\d,.-]/g, "").trim();
}

function parseRateMinor(currency: string, text: string): number | null {
  if (currency === "TRY") return parseTryToKurus(text);
  return parseFxNative(text);
}

export function GroupSaleForm({
  open,
  onClose,
  customerId,
  correcting,
  embedded,
  onSaved,
}: Props) {
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
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
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
      setLines([newLine()]);
    }
    setError(null);
  }, [open, correcting, loadMenus, loadCustomers]);

  const isForex = currency !== "TRY";
  const fxRateKurus = parseTryToKurus(fxRateText);
  const hasSaleDateRate = fxRateKurus !== null && fxRateKurus > 0;

  const parsedLines = useMemo(() => {
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
        /** Which field the reader typed — the other is derived and read-only. */
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

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
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

  const customerOptions = customers.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  return (
    <>
    <FormDialogShell
      open={open}
      onClose={onClose}
      title={title}
      embedded={embedded}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="group-sale-date">Sale date</Label>
          <DateInput
            id="group-sale-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        {!customerId && (
          <div>
            <Label htmlFor="group-sale-agency">Agency</Label>
            <Combobox
              id="group-sale-agency"
              options={customerOptions}
              value={selectedCustomerId}
              onValueChange={setSelectedCustomerId}
            />
          </div>
        )}
        <div>
          <Label htmlFor="group-sale-currency">Booking currency</Label>
          <Combobox
            id="group-sale-currency"
            options={currencyOptions}
            value={currency}
            onValueChange={setCurrency}
          />
        </div>

        {isForex && (
          <div>
            <Label htmlFor="group-sale-fx-rate">{fxRateFieldLabel(currency)}</Label>
            <MoneyInput
              id="group-sale-fx-rate"
              value={fxRateText}
              onChange={setFxRateText}
              placeholder="e.g. 35,00"
            />
            <ValidationHint variant="hint">
              {fxRateHelperText(currency, hasSaleDateRate)}
            </ValidationHint>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Menu lines</Label>
            <Button type="button" variant="secondary" onClick={addLine}>
              Add line
            </Button>
          </div>
          {lines.map((line, index) => (
            <div
              key={line.key}
              className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-12"
            >
              <div className="sm:col-span-4">
                <Label className="text-xs">Menu</Label>
                <GroupSaleMenuPicker
                  menus={menus}
                  currency={currency}
                  line={line}
                  onChange={(patch) => updateLine(line.key, patch)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Pax</Label>
                <Input
                  inputMode="numeric"
                  value={line.paxText}
                  onChange={(e) =>
                    updateLine(line.key, { paxText: e.target.value })
                  }
                  placeholder="e.g. 10"
                />
              </div>
              {/* Fill either one. Whichever you type drives the other, and
                  the one you typed is the figure that posts — enter a total of
                  94,00 for 6 and 94,00 posts, not the 94,02 a rounded 15,67
                  would multiply to. */}
              <div className="sm:col-span-4">
                <Label className="text-xs">{ratePerPersonLabel(currency)}</Label>
                <MoneyInput
                  value={
                    parsedLines[index]?.pricedBy === "total"
                      ? derivedRateText(parsedLines[index], currency)
                      : line.rateText
                  }
                  disabled={parsedLines[index]?.pricedBy === "total"}
                  onChange={(text) => {
                    const typedRate = parseRateMinor(currency, text);
                    const pax = Number.parseInt(line.paxText.trim(), 10);
                    const validPax = Number.isFinite(pax) && pax > 0;
                    const autoTotal =
                      validPax && typedRate !== null && typedRate > 0
                        ? minorToText(pax * typedRate, currency)
                        : "";
                    updateLine(line.key, {
                      rateText: text,
                      totalText: autoTotal,
                    });
                  }}
                  placeholder={isForex ? "e.g. 12,00" : "e.g. 350,00"}
                />
                {(() => {
                  // A note, never a block: agencies negotiate, and a line at
                  // a price the catalogue does not carry is ordinary. The
                  // point is to make sure it was meant.
                  const note = menuPriceNote(
                    menus.find((m) => m.id === line.group_menu_id) ?? null,
                    currency,
                    parsedLines[index]?.rate ?? null,
                  );
                  return note ? (
                    <p className="mt-1 text-xs text-muted-foreground">{note}</p>
                  ) : null;
                })()}
              </div>
              <div className="sm:col-span-4">
                <Label className="text-xs">
                  Total for the line ({isForex ? currency : "₺"})
                </Label>
                <MoneyInput
                  value={
                    parsedLines[index]?.pricedBy === "rate"
                      ? derivedTotalText(parsedLines[index], currency)
                      : line.totalText
                  }
                  onChange={(text) =>
                    updateLine(line.key, { totalText: text, rateText: "" })
                  }
                  placeholder={isForex ? "e.g. 94,00" : "e.g. 3.500,00"}
                />
              </div>
              <div className="flex items-end justify-between sm:col-span-2">
                <p className="text-sm tabular-nums text-muted-foreground">
                  {parsedLines[index]?.lineTotalMinor != null
                    ? isForex
                      ? formatFxNative(
                          parsedLines[index].lineTotalMinor!,
                          currency,
                        )
                      : formatTry(parsedLines[index].lineTotalMinor!)
                    : "—"}
                </p>
                {lines.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => removeLine(line.key)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-md bg-muted/50 p-3 text-sm">
          <p>
            {bookingTotalLabel(currency)}:{" "}
            <span className="font-medium tabular-nums">
              {totalMinor != null
                ? isForex
                  ? formatFxNative(totalMinor, currency)
                  : formatTry(totalMinor)
                : "—"}
            </span>
            {isForex ? (
              <> {forexFooterSuffix(fxRateKurus, totalTryPreview, fxRateText)}</>
            ) : null}
          </p>
        </div>

        <div>
          <Label htmlFor="group-sale-note">Note (optional)</Label>
          <Input
            id="group-sale-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={GROUP_SALE_NOTE_PLACEHOLDER}
            maxLength={512}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Saving…"
              : isCorrect
                ? "Save correction"
                : "Record group sale"}
          </Button>
        </div>
      </form>
    </FormDialogShell>
    <DuplicateRecordDialog />
    </>
  );
}
