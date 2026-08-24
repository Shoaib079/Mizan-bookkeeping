"use client";

/** Booking total, note, error, and submit actions for GroupSaleForm. */

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  bookingTotalLabel,
  forexFooterSuffix,
  GROUP_SALE_NOTE_PLACEHOLDER,
} from "@/lib/group-sale-form-copy";
import { formatFxNative } from "@/lib/fx-money";
import { formatTry } from "@/lib/money";

export type GroupSaleFormFooterProps = {
  currency: string;
  isForex: boolean;
  totalMinor: number | null;
  fxRateKurus: number | null;
  totalTryPreview: number | null;
  fxRateText: string;
  note: string;
  onNoteChange: (value: string) => void;
  error: string | null;
  submitting: boolean;
  isCorrect: boolean;
  onClose: () => void;
};

export function GroupSaleFormFooter({
  currency,
  isForex,
  totalMinor,
  fxRateKurus,
  totalTryPreview,
  fxRateText,
  note,
  onNoteChange,
  error,
  submitting,
  isCorrect,
  onClose,
}: GroupSaleFormFooterProps) {
  return (
    <>
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
          onChange={(e) => onNoteChange(e.target.value)}
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
    </>
  );
}
