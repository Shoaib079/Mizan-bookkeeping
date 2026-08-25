"use client";

/** Input fields for partner profit allocation (before preview). */

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";

export type PartnerProfitAllocationFieldsProps = {
  allocationDateText: string;
  onAllocationDateChange: (value: string) => void;
  amountText: string;
  onAmountChange: (value: string) => void;
  periodFromText: string;
  onPeriodFromChange: (value: string) => void;
  periodToText: string;
  onPeriodToChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  netAgainstDrawings: boolean;
  onNetAgainstDrawingsChange: (value: boolean) => void;
  previewLoading: boolean;
  onPreview: () => void;
};

export function PartnerProfitAllocationFields({
  allocationDateText,
  onAllocationDateChange,
  amountText,
  onAmountChange,
  periodFromText,
  onPeriodFromChange,
  periodToText,
  onPeriodToChange,
  description,
  onDescriptionChange,
  netAgainstDrawings,
  onNetAgainstDrawingsChange,
  previewLoading,
  onPreview,
}: PartnerProfitAllocationFieldsProps) {
  return (
    <>
      <div>
        <Label htmlFor="alloc-date">Allocation date</Label>
        <DateInput
          id="alloc-date"
          value={allocationDateText}
          onChange={onAllocationDateChange}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Type how much to distribute. Optional period only decides which
        drawings to net against — it never replaces your amount. Leave the
        amount blank to distribute the period’s full net profit instead.
      </p>

      <div>
        <Label htmlFor="alloc-amount">Profit amount (TRY)</Label>
        <MoneyInput
          id="alloc-amount"
          value={amountText}
          onChange={onAmountChange}
          placeholder="How much to allocate"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="period-from">Period from (drawings cutoff)</Label>
          <DateInput
            id="period-from"
            value={periodFromText}
            onChange={onPeriodFromChange}
          />
        </div>
        <div>
          <Label htmlFor="period-to">Period to</Label>
          <DateInput
            id="period-to"
            value={periodToText}
            onChange={onPeriodToChange}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="alloc-desc">Note (optional)</Label>
        <Input
          id="alloc-desc"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={netAgainstDrawings}
          onChange={(e) => onNetAgainstDrawingsChange(e.target.checked)}
        />
        <span>
          Net against amount already taken — settle each partner&apos;s share of
          profit against their net balance (drawings, partner-paid expenses, loans) on
          or before the profit period end, or the allocation date when using a
          fixed amount. Movements after that date are ignored so later drawings
          stay separate.
        </span>
      </label>

      <Button
        type="button"
        variant="secondary"
        disabled={previewLoading}
        onClick={onPreview}
      >
        {previewLoading ? "Loading preview…" : "Preview split"}
      </Button>
    </>
  );
}
