/** Statement review API actions — testable wrappers around existing endpoints. */

import { apiFetch } from "@/lib/api";
import type {
  ClassifyStatementLineResult,
  CreateSupplierFromLineResult,
  StatementLineClassification,
} from "@/lib/banking-types";

export type ClassifyLinePayload = {
  classification: StatementLineClassification;
  actor_id: string;
  match_token?: string;
  supplier_id?: string;
  counterpart_money_account_id?: string;
  credit_card_money_account_id?: string;
  customer_id?: string;
  delivery_platform_id?: string;
  expense_account_id?: string;
  employee_id?: string;
  period_year?: number;
  period_month?: number;
  period_salary_minor?: number;
  partner_id?: string;
  confirm_supplier_ledger_entry_id?: string;
  confirm_account_transfer_id?: string;
};

export type CorrectLinePayload = ClassifyLinePayload & {
  reason: string;
};

export type CreateSupplierPayload = {
  name?: string;
  vkn?: string;
  match_token?: string;
};

export async function classifyStatementLine(
  entityId: string,
  statementId: string,
  lineId: string,
  payload: ClassifyLinePayload,
  idempotencyKey: string,
): Promise<ClassifyStatementLineResult> {
  return apiFetch<ClassifyStatementLineResult>(
    `/entities/${entityId}/banking/statements/${statementId}/lines/${lineId}/classify`,
    {
      method: "PATCH",
      idempotencyKey,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function correctStatementLine(
  entityId: string,
  statementId: string,
  lineId: string,
  payload: CorrectLinePayload,
  idempotencyKey: string,
): Promise<ClassifyStatementLineResult> {
  return apiFetch<ClassifyStatementLineResult>(
    `/entities/${entityId}/banking/statements/${statementId}/lines/${lineId}/correct`,
    {
      method: "POST",
      idempotencyKey,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function createSupplierFromStatementLine(
  entityId: string,
  statementId: string,
  lineId: string,
  payload: CreateSupplierPayload,
  idempotencyKey: string,
): Promise<CreateSupplierFromLineResult> {
  return apiFetch<CreateSupplierFromLineResult>(
    `/entities/${entityId}/banking/statements/${statementId}/lines/${lineId}/create-supplier`,
    {
      method: "POST",
      idempotencyKey,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}
