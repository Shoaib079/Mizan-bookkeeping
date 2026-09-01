/** Payment bounce pair API + helpers. */

import { apiFetch } from "@/lib/api";
import type {
  BankStatementLine,
  BouncePersonType,
  StatementBouncePairResult,
} from "@/lib/banking-types";
import { formatTry } from "@/lib/money";

export type RecordPaymentBounceInput = {
  outflowLineId: string;
  returnLineId: string;
  personType: BouncePersonType;
  personId: string;
  feeLineId?: string | null;
  feeLineIds?: string[] | null;
  reason?: string;
  autoVoidConfirmed?: boolean;
  actorId?: string | null;
  idempotencyKey: string;
};

export type BounceNetFee = {
  lineIds: string[];
  netKurus: number;
  description: string;
};

export const BOUNCE_NET_FEE_OPTION = "net";

export type BounceLineUiState =
  | "unposted"
  | "posted"
  | "linked"
  | "classified"
  | "needs_void";

/** Rough UI state from line fields (journal may be voided server-side). */
export function bounceLineUiState(line: BankStatementLine): BounceLineUiState {
  if (line.status === "linked") return "linked";
  if (line.status === "posted") return "posted";
  if (line.status === "classified") return "classified";
  if (line.journal_entry_id) return "needs_void";
  return "unposted";
}

export function bounceLineNeedsAutoVoid(line: BankStatementLine): boolean {
  const state = bounceLineUiState(line);
  return state === "posted" || state === "linked" || state === "needs_void";
}

export function bounceOutflowStateHint(line: BankStatementLine): string | null {
  switch (bounceLineUiState(line)) {
    case "posted":
      return "Posted — will auto-void";
    case "linked":
      return "Linked — will auto-void";
    case "classified":
      return "Skipped — will pair";
    case "needs_void":
      return "Has ledger entry — will auto-void";
    default:
      return null;
  }
}

function isBounceCandidateLine(line: BankStatementLine): boolean {
  return line.classification !== "payment_bounced" && line.bounce_pair_id == null;
}

function matchesOutflowAmount(line: BankStatementLine, amount: number): boolean {
  return line.amount_kurus < 0 && Math.abs(line.amount_kurus) === amount;
}

export function recordPaymentBounce(
  entityId: string,
  statementId: string,
  input: RecordPaymentBounceInput,
): Promise<StatementBouncePairResult> {
  const feeLineIds =
    input.feeLineIds ??
    (input.feeLineId ? [input.feeLineId] : null);

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
        fee_line_id: feeLineIds?.length === 1 ? feeLineIds[0] : null,
        fee_line_ids: feeLineIds,
        reason: input.reason ?? null,
        auto_void_confirmed: input.autoVoidConfirmed ?? false,
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
      isBounceCandidateLine(line),
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
      matchesOutflowAmount(line, amount) &&
      isBounceCandidateLine(line),
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
      line.amount_kurus !== 0 &&
      isBounceCandidateLine(line),
  );
}

export function formatBounceOutflowLabel(line: BankStatementLine): string {
  const hint = bounceOutflowStateHint(line);
  const base = `${formatTry(line.amount_kurus)} · ${line.description}`;
  return hint ? `${base} (${hint})` : base;
}

export function buildBounceNetFee(
  candidates: BankStatementLine[],
): BounceNetFee | null {
  if (candidates.length === 0) return null;
  const netKurus = candidates.reduce((sum, line) => sum + line.amount_kurus, 0);
  return {
    lineIds: candidates.map((line) => line.id),
    netKurus,
    description:
      netKurus === 0
        ? "No net fee"
        : candidates.map((line) => line.description).join(" · "),
  };
}

export function formatBounceNetFeeLabel(netFee: BounceNetFee): string {
  return `Net fee: ${formatTry(netFee.netKurus)} · ${netFee.description}`;
}

/** Lines involved in a bounce that may need auto-void on submit. */
export function bounceAutoVoidTargets(
  lines: BankStatementLine[],
  outflowLineId: string,
  returnLineId: string,
  feeLineIds: string[],
): BankStatementLine[] {
  const ids = new Set([outflowLineId, returnLineId, ...feeLineIds]);
  return lines.filter((line) => ids.has(line.id) && bounceLineNeedsAutoVoid(line));
}
