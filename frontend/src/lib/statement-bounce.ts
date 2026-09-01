/** Payment bounce pair API + helpers. */

import { apiFetch } from "@/lib/api";
import type {
  BankStatementLine,
  BouncePersonType,
  StatementBouncePairResult,
} from "@/lib/banking-types";

export type RecordPaymentBounceInput = {
  outflowLineId: string;
  returnLineId: string;
  personType: BouncePersonType;
  personId: string;
  feeLineId?: string | null;
  reason?: string;
  actorId?: string | null;
  idempotencyKey: string;
};

export function recordPaymentBounce(
  entityId: string,
  statementId: string,
  input: RecordPaymentBounceInput,
): Promise<StatementBouncePairResult> {
  return apiFetch<StatementBouncePairResult>(
    `/entities/${entityId}/banking/statements/${statementId}/bounce-pair`,
    {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: JSON.stringify({
        outflow_line_id: input.outflowLineId,
        return_line_id: input.returnLineId,
        person_type: input.personType,
        person_id: input.personId,
        fee_line_id: input.feeLineId ?? null,
        reason: input.reason ?? null,
        actor_id: input.actorId ?? null,
      }),
    },
  );
}

export function bounceReturnCandidates(
  lines: BankStatementLine[],
  outflow: BankStatementLine,
): BankStatementLine[] {
  const amount = Math.abs(outflow.amount_kurus);
  return lines.filter(
    (line) =>
      line.id !== outflow.id &&
      line.amount_kurus > 0 &&
      line.amount_kurus === amount &&
      line.status !== "posted" &&
      line.status !== "linked" &&
      line.classification !== "payment_bounced",
  );
}

/** Matching payment outflows for a return inflow — bounce starts from the return. */
export function bounceOutflowCandidates(
  lines: BankStatementLine[],
  returnLine: BankStatementLine,
): BankStatementLine[] {
  const amount = returnLine.amount_kurus;
  if (amount <= 0) return [];
  return lines.filter(
    (line) =>
      line.id !== returnLine.id &&
      line.amount_kurus < 0 &&
      Math.abs(line.amount_kurus) === amount &&
      line.status !== "posted" &&
      line.status !== "linked" &&
      line.classification !== "payment_bounced",
  );
}

export function bounceFeeCandidates(
  lines: BankStatementLine[],
  outflowLineId: string,
  returnLineId: string,
): BankStatementLine[] {
  return lines.filter(
    (line) =>
      line.id !== outflowLineId &&
      line.id !== returnLineId &&
      line.amount_kurus < 0 &&
      line.status !== "posted" &&
      line.status !== "linked" &&
      line.classification !== "payment_bounced",
  );
}
