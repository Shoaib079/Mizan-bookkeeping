"use client";

/** Date, agency, currency, optional FX rate for GroupSaleForm. */

import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ValidationHint } from "@/components/ui/validation-hint";
import {
  fxRateFieldLabel,
  fxRateHelperText,
} from "@/lib/group-sale-form-copy";

export type GroupSaleFormHeaderFieldsProps = {
  dateText: string;
  onDateTextChange: (value: string) => void;
  showAgency: boolean;
  customerOptions: { value: string; label: string }[];
  selectedCustomerId: string;
  onSelectedCustomerIdChange: (value: string) => void;
  currency: string;
  currencyOptions: { value: string; label: string }[];
  onCurrencyChange: (value: string) => void;
  isForex: boolean;
  fxRateText: string;
  onFxRateTextChange: (value: string) => void;
  hasSaleDateRate: boolean;
};

export function GroupSaleFormHeaderFields({
  dateText,
  onDateTextChange,
  showAgency,
  customerOptions,
  selectedCustomerId,
  onSelectedCustomerIdChange,
  currency,
  currencyOptions,
  onCurrencyChange,
  isForex,
  fxRateText,
  onFxRateTextChange,
  hasSaleDateRate,
}: GroupSaleFormHeaderFieldsProps) {
  return (
    <>
      <div>
        <Label htmlFor="group-sale-date">Sale date</Label>
        <DateInput
          id="group-sale-date"
          value={dateText}
          onChange={onDateTextChange}
          required
        />
      </div>
      {showAgency && (
        <div>
          <Label htmlFor="group-sale-agency">Agency</Label>
          <Combobox
            id="group-sale-agency"
            options={customerOptions}
            value={selectedCustomerId}
            onValueChange={onSelectedCustomerIdChange}
          />
        </div>
      )}
      <div>
        <Label htmlFor="group-sale-currency">Booking currency</Label>
        <Combobox
          id="group-sale-currency"
          options={currencyOptions}
          value={currency}
          onValueChange={onCurrencyChange}
        />
      </div>

      {isForex && (
        <div>
          <Label htmlFor="group-sale-fx-rate">{fxRateFieldLabel(currency)}</Label>
          <MoneyInput
            id="group-sale-fx-rate"
            value={fxRateText}
            onChange={onFxRateTextChange}
            placeholder="e.g. 35,00"
          />
          <ValidationHint variant="hint">
            {fxRateHelperText(currency, hasSaleDateRate)}
          </ValidationHint>
        </div>
      )}
    </>
  );
}
