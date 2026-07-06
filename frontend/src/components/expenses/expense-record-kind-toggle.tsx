"use client";

import { cn } from "@/lib/utils";

export type ExpenseRecordKind = "expense" | "salary";

type Props = {
  value: ExpenseRecordKind;
  onChange: (value: ExpenseRecordKind) => void;
  className?: string;
};

/** Prominent expense vs salary switch — used on Expenses hub and manual expense dialog. */
export function ExpenseRecordKindToggle({
  value,
  onChange,
  className,
}: Props) {
  return (
    <div
      className={cn("flex flex-wrap gap-1", className)}
      role="tablist"
      aria-label="Record type"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "expense"}
        className={cn(
          "rounded-md border px-3 py-2 text-sm transition-colors",
          value === "expense"
            ? "border-primary bg-primary/10 font-medium text-primary"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onChange("expense")}
      >
        Business expense
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "salary"}
        className={cn(
          "rounded-md border px-3 py-2 text-sm transition-colors",
          value === "salary"
            ? "border-primary bg-primary/10 font-medium text-primary"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onChange("salary")}
      >
        Salary payment
      </button>
    </div>
  );
}
