"use client";

/** Close-day form fields (banner → over/short → submit). */

import type { Dispatch, FormEvent, SetStateAction } from "react";

import { CashDenominationCounter } from "@/components/forms/cash-denomination-counter";
import { MainTillReference } from "@/components/forms/main-till-reference";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import type { MoneyAccountLeaf } from "@/lib/banking-types";
import { formatTry } from "@/lib/money";
import { cn } from "@/lib/utils";

export type CashCloseDayFormBodyProps = {
  usingSavedCount: boolean;
  draftActive: boolean;
  onDiscardDraft: () => void;
  dateText: string;
  onDateTextChange: (value: string) => void;
  tillAccount: MoneyAccountLeaf | null;
  homeAccount: MoneyAccountLeaf | null;
  expectedKurus: number | null;
  useNotes: boolean;
  onToggleUseNotes: () => void;
  quantities: Record<number, number>;
  onQuantitiesChange: Dispatch<SetStateAction<Record<number, number>>>;
  onClearDenominations: () => void;
  countedText: string;
  onCountedTextChange: (value: string) => void;
  noteLinesLength: number;
  overShortKurus: number | null;
  description: string;
  onDescriptionChange: (value: string) => void;
  error: string | null;
  confirmWarning: string | null;
  onClearConfirmWarning: () => void;
  submitting: boolean;
  onSubmit: (event: FormEvent) => void;
  onConfirmLargeVariance: () => void;
};

export function CashCloseDayFormBody({
  usingSavedCount,
  draftActive,
  onDiscardDraft,
  dateText,
  onDateTextChange,
  tillAccount,
  homeAccount,
  expectedKurus,
  useNotes,
  onToggleUseNotes,
  quantities,
  onQuantitiesChange,
  onClearDenominations,
  countedText,
  onCountedTextChange,
  noteLinesLength,
  overShortKurus,
  description,
  onDescriptionChange,
  error,
  confirmWarning,
  onClearConfirmWarning,
  submitting,
  onSubmit,
  onConfirmLargeVariance,
}: CashCloseDayFormBodyProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid="close-day-form">
      {usingSavedCount && draftActive && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Using the count saved from Count cash — edit if needed, then post.
          </span>
          <Button type="button" variant="ghost" onClick={onDiscardDraft}>
            Discard
          </Button>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Posts the counted total and over/short for the <strong>Main</strong>{" "}
        till, then locks that drawer day. Next you can send part to Cash at
        home (reference balance above) and leave the rest as counter float in
        Main.
      </p>
      <div>
        <Label htmlFor="close-day-date">Session date (DD.MM.YYYY)</Label>
        <DateInput
          id="close-day-date"
          value={dateText}
          onChange={onDateTextChange}
          required
        />
      </div>
      <MainTillReference
        till={tillAccount}
        home={homeAccount}
        expectedKurus={expectedKurus}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">How are you counting?</p>
        <Button type="button" variant="secondary" onClick={onToggleUseNotes}>
          {useNotes ? "Type total only" : "Count by notes"}
        </Button>
      </div>
      {useNotes && (
        <CashDenominationCounter
          quantities={quantities}
          onChange={onQuantitiesChange}
          onClear={onClearDenominations}
        />
      )}
      <div>
        <Label htmlFor="close-day-counted">Counted balance (TRY)</Label>
        <MoneyInput
          id="close-day-counted"
          placeholder="e.g. 2.350,00"
          value={countedText}
          onChange={onCountedTextChange}
          required
          disabled={useNotes && noteLinesLength > 0}
        />
      </div>
      {overShortKurus !== null && (
        <div
          className={cn(
            "flex items-baseline justify-between gap-4 rounded-md px-3 py-2 text-sm",
            overShortKurus === 0 && "bg-success/10 text-success",
            overShortKurus > 0 && "bg-warning/10 text-warning",
            overShortKurus < 0 && "bg-destructive/10 text-destructive",
          )}
        >
          <span>
            {overShortKurus === 0
              ? "Drawer matches the books"
              : overShortKurus > 0
                ? "Over — more cash than expected"
                : "Short — less cash than expected"}
          </span>
          <span className="font-semibold tabular-nums">
            {overShortKurus > 0 ? "+" : ""}
            {formatTry(overShortKurus)}
          </span>
        </div>
      )}
      <div>
        <Label htmlFor="close-day-desc">Description</Label>
        <Input
          id="close-day-desc"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {confirmWarning ? (
        <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">{confirmWarning}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={onClearConfirmWarning}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={onConfirmLargeVariance}
            >
              {submitting ? "Posting…" : "Post anyway"}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="submit" disabled={submitting}>
          {submitting ? "Closing…" : "Close day"}
        </Button>
      )}
    </form>
  );
}
