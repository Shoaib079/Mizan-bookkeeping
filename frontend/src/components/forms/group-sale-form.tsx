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
import { FOREX_CURRENCIES } from "@/lib/group-sales-types";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useDuplicateRecordSubmit } from "@/lib/use-duplicate-record-submit";
import { useToast } from "@/lib/toast";
import { formatTry, formatTrDate, parseTrDate, parseTryToKurus } from "@/lib/money";

type LineDraft = {
  key: string;
  group_menu_id: string | null;
  menu_name: string;
  paxText: string;
  rateText: string;
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
  };
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
  const [description, setDescription] = useState("Group sale");
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
      setDescription(correcting.description);
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
          rateText:
            correcting.currency === "TRY"
              ? (line.rate_per_person_minor / 100).toFixed(2).replace(".", ",")
              : formatFxNative(line.rate_per_person_minor, correcting.currency)
                  .replace(/[^\d,.-]/g, "")
                  .trim(),
        })),
      );
    } else {
      setDateText(todayTrDate());
      setCurrency("TRY");
      setFxRateText("");
      setDescription("Group sale");
      setLines([newLine()]);
    }
    setError(null);
  }, [open, correcting, loadMenus, loadCustomers]);

  const isForex = currency !== "TRY";
  const fxRateKurus = parseTryToKurus(fxRateText);

  const parsedLines = useMemo(() => {
    return lines.map((line) => {
      const pax = Number.parseInt(line.paxText.trim(), 10);
      const rate = parseRateMinor(currency, line.rateText);
      const validPax = Number.isFinite(pax) && pax > 0;
      const validRate = rate !== null && rate > 0;
      const lineTotalMinor =
        validPax && validRate ? pax * rate : null;
      return { ...line, pax: validPax ? pax : null, rate, lineTotalMinor };
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

  const menuOptions = useMemo(
    () => menus.map((m) => ({ value: m.id, label: m.name })),
    [menus],
  );

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
    if (isForex && (fxRateKurus === null || fxRateKurus <= 0)) {
      setError("Enter the sale-date TRY rate (₺ per 1 unit of foreign currency).");
      return;
    }

    const apiLines = parsedLines.map((line) => {
      if (line.pax === null || line.rate === null) {
        throw new Error("Each line needs pax and a valid rate.");
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
        rate_per_person_minor: line.rate,
      };
    });

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        customer_id: resolvedCustomerId,
        sale_date: saleDate,
        description,
        currency,
        lines: apiLines,
        actor_id: actorId,
        fx_rate_used: isForex ? fxRateKurus : undefined,
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
            <Label htmlFor="group-sale-fx-rate">
              Sale-date rate (₺ per 1 {currency})
            </Label>
            <MoneyInput
              id="group-sale-fx-rate"
              value={fxRateText}
              onChange={setFxRateText}
              placeholder="35,00"
            />
            <ValidationHint>
              Objective rate for this sale date — revenue is booked in TRY at this rate.
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
                <Combobox
                  options={[
                    { value: "", label: "Type or pick…" },
                    ...menuOptions,
                  ]}
                  value={line.group_menu_id ?? ""}
                  onValueChange={(value) => {
                    const menu = menus.find((m) => m.id === value);
                    updateLine(line.key, {
                      group_menu_id: value || null,
                      menu_name: menu?.name ?? line.menu_name,
                    });
                  }}
                />
                <Input
                  className="mt-1"
                  value={line.menu_name}
                  onChange={(e) =>
                    updateLine(line.key, { menu_name: e.target.value })
                  }
                  placeholder="Menu name"
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
                  placeholder="10"
                />
              </div>
              <div className="sm:col-span-4">
                <Label className="text-xs">
                  Rate / person ({isForex ? currency : "TRY"})
                </Label>
                <MoneyInput
                  value={line.rateText}
                  onChange={(text) => updateLine(line.key, { rateText: text })}
                  placeholder={isForex ? "12,00" : "350,00"}
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
            Total ({currency}):{" "}
            <span className="font-medium tabular-nums">
              {totalMinor != null
                ? isForex
                  ? formatFxNative(totalMinor, currency)
                  : formatTry(totalMinor)
                : "—"}
            </span>
          </p>
          {isForex && (
            <p className="mt-1 text-muted-foreground">
              TRY revenue (at sale-date rate):{" "}
              <span className="tabular-nums">
                {totalTryPreview != null ? formatTry(totalTryPreview) : "—"}
              </span>
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="group-sale-desc">Description</Label>
          <Input
            id="group-sale-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
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
