"use client";

/** Inline payment panel — Staff first; supplier/customer cash-only. */

import { useState } from "react";

import { renderEmbeddedForm } from "@/components/record/people-record-embedded-form";
import {
  kindLabel,
  pickerLabel,
} from "@/components/record/people-record-dialog-helpers";
import { usePeopleRecordDialog } from "@/components/record/use-people-record-dialog";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/input";
import type { PersonPickerKind, RecordActionKey } from "@/lib/record-actions";
import { cn } from "@/lib/utils";

const PAYMENT_KINDS: {
  action: RecordActionKey;
  kind: PersonPickerKind;
  label: string;
  /** Cash drawers only — bank payments come from the statement. */
  cashOnly: boolean;
}[] = [
  { action: "staffPayment", kind: "staff", label: "Staff", cashOnly: false },
  {
    action: "supplierPayment",
    kind: "supplier",
    label: "Supplier",
    cashOnly: true,
  },
  {
    action: "customerPayment",
    kind: "customer",
    label: "Customer",
    cashOnly: true,
  },
];

type Props = {
  onSaved: () => void;
};

export function RecordPaymentPanel({ onSaved }: Props) {
  const [kindIndex, setKindIndex] = useState(0);
  const selected = PAYMENT_KINDS[kindIndex]!;
  const page = usePeopleRecordDialog({
    open: true,
    action: selected.action,
    kind: selected.kind,
    onClose: onSaved,
  });

  return (
    <div className="space-y-3" data-testid="record-payment-panel">
      <div className="flex flex-wrap gap-1.5">
        {PAYMENT_KINDS.map((item, index) => (
          <button
            key={item.action}
            type="button"
            data-testid={`record-payment-tab-${item.kind}`}
            onClick={() => setKindIndex(index)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              index === kindIndex
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/50",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {selected.cashOnly && (
        <p className="text-xs text-muted-foreground">
          Cash only — bank payments come from the statement.
        </p>
      )}

      {!selected.cashOnly && (
        <p className="text-xs text-muted-foreground">
          Pay from cash drawer or a partner (owe them). Bank salaries come from
          the statement.
        </p>
      )}

      {!page.entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar first.
        </p>
      )}

      {page.entityId && page.loading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {page.entityId && !page.loading && page.loadError && (
        <p className="text-sm text-destructive">{page.loadError}</p>
      )}

      {page.entityId &&
        !page.loading &&
        !page.loadError &&
        page.items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No {kindLabel(selected.kind)} found — add one from the directory
            first.
          </p>
        )}

      {page.entityId &&
        !page.loading &&
        !page.loadError &&
        page.items.length > 0 && (
          <div className="space-y-3">
            {page.showStaffDate && (
              <div>
                <Label htmlFor="record-payment-date">Date (DD.MM.YYYY)</Label>
                <DateInput
                  id="record-payment-date"
                  value={page.dateText}
                  onChange={page.setDateText}
                  required
                />
              </div>
            )}
            <div>
              <Label>{pickerLabel(selected.kind)}</Label>
              <Combobox
                value={page.selectedId}
                onValueChange={page.setSelectedId}
                options={page.options}
                placeholder={`Choose ${kindLabel(selected.kind)}…`}
              />
            </div>

            {page.balanceLoading && (
              <p className="text-sm text-muted-foreground">Loading balance…</p>
            )}
            {page.balanceError && (
              <p className="text-sm text-destructive">{page.balanceError}</p>
            )}

            {page.formReady && page.selected && page.entityId && (
              <div className="border-t border-border pt-3">
                {renderEmbeddedForm(
                  selected.action,
                  page.selected,
                  page.balanceKurus,
                  page.entityId,
                  onSaved,
                  page.paymentDateIso,
                  { cashOnly: selected.cashOnly },
                )}
              </div>
            )}
          </div>
        )}
    </div>
  );
}
