/** Types for bank statement line classification options. */

import type { StatementLineClassification } from "@/lib/banking-types";

export type ClassificationTarget =
  | "supplier"
  | "customer"
  | "employee"
  | "partner"
  | "transfer"
  | "credit_card"
  | "expense"
  | "income"
  | "delivery_platform";

export type ClassificationOption = {
  value: StatementLineClassification;
  label: string;
  hint: string;
  /** Positive bank inflow, negative outflow, or both. */
  direction: "inflow" | "outflow" | "both";
  target: ClassificationTarget | null;
};

export type ClassificationOptionGroups = {
  inflows: ClassificationOption[];
  outflows: ClassificationOption[];
  other: ClassificationOption[];
};
