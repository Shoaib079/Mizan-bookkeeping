/** Form defaults for bank statement classify / correct — queue vs posted. */

import type {
  BankStatementLine,
  StatementLineClassification,
} from "@/lib/banking-types";
import {
  classificationOption,
  initialClassificationForLine,
  suggestDeliveryPlatformId,
  suggestSupplierId,
} from "@/lib/statement-classification-options";
import { isQueueLine } from "@/lib/statement-line-filters";
import type { StatementClassificationPickers } from "@/lib/use-statement-classification-pickers";

export type StatementLineFormTargets = {
  classification: StatementLineClassification;
  supplierId: string;
  customerId: string;
  employeeId: string;
  partnerId: string;
  counterpartId: string;
  creditCardId: string;
  expenseAccountId: string;
  deliveryPlatformId: string;
};

function pickName<T extends { id: string; name: string }>(
  items: T[],
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return items.find((item) => item.id === id)?.name ?? null;
}

/**
 * Queue post: suggestions + first-list fallback for speed.
 * Correct: only stored ids and description matches — never default to list[0].
 */
export function hydrateStatementLineFormState(
  line: BankStatementLine,
  pickers: StatementClassificationPickers,
  purpose: "post" | "correct",
): StatementLineFormTargets {
  const classification = initialClassificationForLine(line);
  const allowListFallback = isQueueLine(line) && purpose === "post";

  let supplierId = line.supplier_id ?? "";
  if (!supplierId) {
    if (line.suggestion?.supplier_id) {
      supplierId = line.suggestion.supplier_id;
    } else {
      const suggested = suggestSupplierId(line.description, pickers.suppliers);
      if (suggested) supplierId = suggested;
      else if (allowListFallback && pickers.suppliers[0]) {
        supplierId = pickers.suppliers[0].id;
      }
    }
  }

  let customerId = line.customer_id ?? "";
  if (!customerId && allowListFallback && pickers.customers[0]) {
    customerId = pickers.customers[0].id;
  }

  let employeeId = line.employee_id ?? "";
  if (!employeeId && allowListFallback && pickers.employees[0]) {
    employeeId = pickers.employees[0].id;
  }

  let partnerId = line.partner_id ?? "";
  if (!partnerId && allowListFallback && pickers.partners[0]) {
    partnerId = pickers.partners[0].id;
  }

  let counterpartId = "";
  if (allowListFallback && pickers.moneyAccounts[0]) {
    counterpartId = pickers.moneyAccounts[0].id;
  }

  let creditCardId = "";
  if (allowListFallback && pickers.creditCards[0]) {
    creditCardId = pickers.creditCards[0].id;
  }

  let expenseAccountId = line.suggestion?.expense_account_id ?? "";
  if (!expenseAccountId && allowListFallback && pickers.expenseAccounts[0]) {
    expenseAccountId = pickers.expenseAccounts[0].id;
  }

  const suggestedPlatform = suggestDeliveryPlatformId(
    line.description,
    pickers.deliveryPlatforms,
  );
  const deliveryPlatformId = suggestedPlatform ?? "";

  return {
    classification,
    supplierId,
    customerId,
    employeeId,
    partnerId,
    counterpartId,
    creditCardId,
    expenseAccountId,
    deliveryPlatformId,
  };
}

/** Read-only label for posted line audit bar (linked supplier, customer, etc.). */
export function postedLineTargetSummary(
  line: BankStatementLine,
  pickers: StatementClassificationPickers,
): string | null {
  if (line.classification === "unclassified") return null;

  const target = classificationOption(line.classification)?.target;
  if (!target) return null;

  switch (target) {
    case "supplier": {
      const fromId = pickName(pickers.suppliers, line.supplier_id);
      if (fromId) return fromId;
      const suggestedId = suggestSupplierId(line.description, pickers.suppliers);
      return suggestedId ? pickName(pickers.suppliers, suggestedId) : null;
    }
    case "customer":
      return pickName(pickers.customers, line.customer_id);
    case "employee":
      return pickName(pickers.employees, line.employee_id);
    case "partner":
      return pickName(pickers.partners, line.partner_id);
    case "transfer":
    case "credit_card":
    case "expense":
    case "delivery_platform":
      return null;
    default:
      return null;
  }
}
