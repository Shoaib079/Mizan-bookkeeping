"use client";

/** Searchable bank statement classification picker — type supplier, POS, tax, etc. */

import { useMemo } from "react";

import { Combobox, type ComboboxPlacement } from "@/components/ui/combobox";
import type { StatementLineClassification } from "@/lib/banking-types";
import {
  classificationComboboxOptionsForAmount,
  classificationOption,
} from "@/lib/statement-classification-options";

type Props = {
  id?: string;
  amountKurus: number;
  value: StatementLineClassification;
  onValueChange: (value: StatementLineClassification) => void;
  disabled?: boolean;
  className?: string;
  placement?: ComboboxPlacement;
  showHint?: boolean;
};

export function ClassificationPicker({
  id,
  amountKurus,
  value,
  onValueChange,
  disabled,
  className,
  placement,
  showHint = false,
}: Props) {
  const options = useMemo(
    () => classificationComboboxOptionsForAmount(amountKurus),
    [amountKurus],
  );
  const hint = classificationOption(value)?.hint;

  return (
    <div className="min-w-0">
      <Combobox
        id={id}
        value={value}
        onValueChange={(next) =>
          onValueChange(next as StatementLineClassification)
        }
        options={options}
        placeholder="Search — supplier, POS, tax, salary…"
        emptyMessage="No matching classification"
        disabled={disabled}
        className={className}
        placement={placement}
      />
      {showHint && hint ? (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
