/** Shared classify / correct request bodies for statement lines. */

import type {
  BankStatementLine,
  StatementLineClassification,
} from "@/lib/banking-types";
import type { ClassifyLinePayload } from "@/lib/statement-review-actions";
import { classificationOption } from "@/lib/statement-classification-options";
import type { StatementLineFormTargets } from "@/lib/statement-line-form-state";

export function learnMatchTokenForLine(
  line: BankStatementLine,
  learnAs: string,
): string | undefined {
  const trimmed = learnAs.trim();
  if (!trimmed || trimmed === line.description.trim()) return undefined;
  return trimmed;
}

export function buildClassifyLinePayload(
  line: BankStatementLine,
  args: {
    actorId: string;
    classification: StatementLineClassification;
    targets: StatementLineFormTargets;
    learnAs?: string;
  },
): ClassifyLinePayload {
  const { classification, actorId, targets } = args;
  const body: ClassifyLinePayload = {
    classification,
    actor_id: actorId,
  };

  const token = learnMatchTokenForLine(line, args.learnAs ?? line.description);
  if (token) body.match_token = token;

  if (classification === "supplier_payment") body.supplier_id = targets.supplierId;
  if (classification === "transfer")
    body.counterpart_money_account_id = targets.counterpartId;
  if (classification === "credit_card_payment")
    body.credit_card_money_account_id = targets.creditCardId;
  if (classification === "customer_payment") body.customer_id = targets.customerId;
  if (classification === "rent_utility" || classification === "store_purchase") {
    body.expense_account_id = targets.expenseAccountId;
  }
  if (classification === "delivery_settlement") {
    body.delivery_platform_id = targets.deliveryPlatformId;
  }
  if (
    classification === "staff_payment" ||
    classification === "staff_advance" ||
    classification === "staff_incentive"
  ) {
    body.employee_id = targets.employeeId;
  }
  if (classificationOption(classification)?.target === "partner") {
    body.partner_id = targets.partnerId;
  }

  if (line.candidate_supplier_ledger_entry_id) {
    body.confirm_supplier_ledger_entry_id = line.candidate_supplier_ledger_entry_id;
  }
  if (line.candidate_account_transfer_id) {
    body.confirm_account_transfer_id = line.candidate_account_transfer_id;
  }

  return body;
}

export function targetsRequiredForClassification(
  classification: StatementLineClassification,
  targets: StatementLineFormTargets,
): boolean {
  switch (classification) {
    case "supplier_payment":
      return !targets.supplierId;
    case "customer_payment":
      return !targets.customerId;
    case "staff_payment":
    case "staff_advance":
    case "staff_incentive":
      return !targets.employeeId;
    case "partner_drawing":
    case "partner_reimbursement":
    case "partner_drawing_repayment":
    case "partner_capital_contribution":
    case "partner_loan_receipt":
    case "partner_loan_payment":
      return !targets.partnerId;
    case "transfer":
      return !targets.counterpartId;
    case "credit_card_payment":
      return !targets.creditCardId;
    case "rent_utility":
    case "store_purchase":
      return !targets.expenseAccountId;
    case "delivery_settlement":
      return !targets.deliveryPlatformId;
    default:
      return false;
  }
}
