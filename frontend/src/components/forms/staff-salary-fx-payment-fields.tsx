"use client";

import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import type { MoneyAccountOption } from "@/lib/load-money-accounts";

type Props = {
  payCurrency: string;
  fxAccounts: MoneyAccountOption[];
  fxWalletId: string;
  onFxWalletIdChange: (id: string) => void;
  tryCostText: string;
  onTryCostTextChange: (value: string) => void;
};

export function StaffSalaryFxPaymentFields({
  payCurrency,
  fxAccounts,
  fxWalletId,
  onFxWalletIdChange,
  tryCostText,
  onTryCostTextChange,
}: Props) {
  return (
    <>
      <div>
        <Label htmlFor="pay-fx-wallet">{payCurrency} wallet</Label>
        <Combobox
          id="pay-fx-wallet"
          value={fxWalletId}
          onValueChange={onFxWalletIdChange}
          options={
            fxAccounts.length === 0
              ? [{ value: "", label: `No ${payCurrency} wallet` }]
              : fxAccounts.map((a) => ({
                  value: a.id,
                  label: a.name,
                }))
          }
          placeholder={`${payCurrency} wallet…`}
          disabled={fxAccounts.length === 0}
        />
      </div>
      <div>
        <Label htmlFor="pay-try-cost">TRY cost</Label>
        <MoneyInput
          id="pay-try-cost"
          placeholder="e.g. 35.000,00"
          value={tryCostText}
          onChange={onTryCostTextChange}
          required
        />
      </div>
    </>
  );
}
