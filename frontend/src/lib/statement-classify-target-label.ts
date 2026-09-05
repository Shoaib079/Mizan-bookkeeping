/** Labels for statement classify target fields (mobile form stack). */

import type { ClassificationTarget } from "@/lib/statement-classification-types";

const TARGET_FIELD_LABEL: Record<ClassificationTarget, string> = {
  supplier: "Supplier",
  customer: "Customer",
  employee: "Employee",
  partner: "Partner",
  transfer: "Other account",
  credit_card: "Credit card",
  expense: "Expense account",
  income: "Income account",
  delivery_platform: "Delivery platform",
};

export function classifyTargetFieldLabel(
  target: ClassificationTarget | null | undefined,
): string | null {
  if (!target) return null;
  return TARGET_FIELD_LABEL[target] ?? null;
}
