"use client";

import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/input";
import {
  formatCashDrawerOptionLabel,
  shouldShowCashDrawerPicker,
} from "@/lib/load-money-accounts";

export type CashDrawerAccount = { id: string; name: string };

type Props = {
  id: string;
  accounts: CashDrawerAccount[];
  value: string;
  onValueChange: (id: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
};

/** Cash drawer account picker — hidden when the entity has only one drawer. */
export function CashDrawerPicker({
  id,
  accounts,
  value,
  onValueChange,
  label = "Cash drawer",
  placeholder = "Cash drawer…",
  className,
}: Props) {
  if (!shouldShowCashDrawerPicker(accounts)) return null;

  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Combobox
        id={id}
        value={value}
        onValueChange={onValueChange}
        options={accounts.map((account) => ({
          value: account.id,
          label: formatCashDrawerOptionLabel(account.name, accounts),
        }))}
        placeholder={placeholder}
      />
    </div>
  );
}
