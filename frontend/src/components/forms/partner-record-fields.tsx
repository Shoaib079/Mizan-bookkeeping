"use client";

/** Fields for PartnerRecordForm (kind, hints, inputs, cash drawer). */

import { CashDrawerPicker } from "@/components/forms/cash-drawer-picker";
import type { PartnerRecordKind } from "@/components/forms/partner-record-types";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import type { MoneyAccountOption } from "@/lib/load-money-accounts";
import {
  partnerBalanceAmount,
  partnerBalanceHeading,
} from "@/lib/partner-balance";
import { formatTry } from "@/lib/money";

export type PartnerRecordFieldsProps = {
  lockedKind?: PartnerRecordKind;
  kind: PartnerRecordKind;
  onKindChange: (kind: PartnerRecordKind) => void;
  kindOptions: { value: PartnerRecordKind; label: string }[];
  netBalanceKurus?: number;
  unpaidProfitKurus: number;
  canReturn: boolean;
  outstandingDrawingKurus: number;
  dateText: string;
  onDateChange: (value: string) => void;
  amountText: string;
  onAmountChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  accounts: MoneyAccountOption[];
  cashAccountId: string;
  onDrawerChange: (id: string) => void;
  error: string | null;
  submitting: boolean;
  submitLabel: string;
};

export function PartnerRecordFields({
  lockedKind,
  kind,
  onKindChange,
  kindOptions,
  netBalanceKurus,
  unpaidProfitKurus,
  canReturn,
  outstandingDrawingKurus,
  dateText,
  onDateChange,
  amountText,
  onAmountChange,
  description,
  onDescriptionChange,
  accounts,
  cashAccountId,
  onDrawerChange,
  error,
  submitting,
  submitLabel,
}: PartnerRecordFieldsProps) {
  return (
    <>
      <p className="text-xs text-muted-foreground">
        Cash drawer only. Bank: classify on the statement.
      </p>
      {!lockedKind && (
        <div>
          <Label>What to record</Label>
          <Combobox
            value={kind}
            onValueChange={(v) => onKindChange(v as PartnerRecordKind)}
            options={kindOptions}
            placeholder="Choose…"
          />
        </div>
      )}
      {kind === "cash" && netBalanceKurus !== undefined && (
        <p className="text-sm text-muted-foreground">
          {partnerBalanceHeading(netBalanceKurus)}:{" "}
          {partnerBalanceAmount(netBalanceKurus)}
        </p>
      )}
      {kind === "cash" && (
        <p className="text-xs text-muted-foreground">
          This payment settles what you owe first; any extra is a withdrawal.
        </p>
      )}
      {kind === "profit_paid" && (
        <p className="text-sm text-muted-foreground">
          Unpaid allocated profit: {formatTry(unpaidProfitKurus)}
          {unpaidProfitKurus <= 0
            ? " — allocate profit on the Partners list first."
            : null}
        </p>
      )}
      {kind === "returned" && (
        <p
          className={
            canReturn
              ? "text-sm text-muted-foreground"
              : "text-sm text-destructive"
          }
        >
          {canReturn ? (
            <>
              Outstanding drawing:{" "}
              {partnerBalanceAmount(outstandingDrawingKurus)}
            </>
          ) : (
            <>
              Nothing to repay right now — there is no open withdrawal to
              close. If they are putting in new money, use Capital in instead.
            </>
          )}
        </p>
      )}
      <div>
        <Label htmlFor="pr-date">Date (DD.MM.YYYY)</Label>
        <DateInput
          id="pr-date"
          value={dateText}
          onChange={onDateChange}
          required
        />
      </div>
      <div>
        <Label htmlFor="pr-amount">Amount (TRY)</Label>
        <MoneyInput
          id="pr-amount"
          value={amountText}
          onChange={onAmountChange}
          required
        />
      </div>
      <div>
        <Label htmlFor="pr-desc">
          {kind === "capital" ? "Note (required)" : "Note (optional)"}
        </Label>
        <Input
          id="pr-desc"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          required={kind === "capital"}
        />
      </div>
      <CashDrawerPicker
        id="pr-cash"
        accounts={accounts}
        value={cashAccountId}
        onValueChange={onDrawerChange}
        label={
          kind === "capital" || kind === "returned"
            ? "Cash drawer"
            : "Pay from cash"
        }
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        type="submit"
        disabled={submitting || (kind === "returned" && !canReturn)}
      >
        {submitting ? "Recording…" : submitLabel}
      </Button>
    </>
  );
}
