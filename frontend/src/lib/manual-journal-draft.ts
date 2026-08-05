/** Building a balanced manual journal.
 *
 * The escape hatch: when something has to be corrected in a way no feature
 * covers, this is how it gets into the books. Everything else in Mizan posts
 * through a purpose-built flow that knows which accounts to touch — a manual
 * journal knows nothing, so the rules it *can* enforce matter more.
 *
 * Kept out of the form so the arithmetic is testable without rendering.
 */

import { parseTryToKurus } from "@/lib/money";

export type DraftLine = {
  /** Local id — rows are added and removed before anything is posted. */
  key: string;
  accountId: string;
  side: "DEBIT" | "CREDIT";
  /** As typed. Parsed at the edge, so a half-typed "1.2" is not an error yet. */
  amountText: string;
};

export type DraftTotals = {
  debitKurus: number;
  creditKurus: number;
  /** Debits − credits. Zero means it balances. */
  differenceKurus: number;
  balanced: boolean;
};

/** Amounts read exactly as they do in every other money field in the app.
 *
 * A first draft of this file grew its own parser, stricter about Turkish
 * thousands grouping. Stricter is not better when it is also *different*: the
 * shared one reads "12.34" as 12,34 ₺ because that is what people type, and one
 * screen disagreeing about what a number means is worse than either rule.
 * Negatives parse here and are rejected below, where the message can explain. */
export { parseTryToKurus as parseAmountToKurus } from "@/lib/money";

export function draftTotals(lines: DraftLine[]): DraftTotals {
  let debitKurus = 0;
  let creditKurus = 0;
  for (const line of lines) {
    const amount = parseTryToKurus(line.amountText);
    if (amount === null) continue;
    if (line.side === "DEBIT") debitKurus += amount;
    else creditKurus += amount;
  }
  const differenceKurus = debitKurus - creditKurus;
  return {
    debitKurus,
    creditKurus,
    differenceKurus,
    balanced: differenceKurus === 0 && debitKurus > 0,
  };
}

export type DraftProblem =
  | "no-lines"
  | "incomplete-line"
  | "zero-amount"
  | "unbalanced"
  | "no-description";

/** Every reason this draft cannot be posted, in the order worth fixing them.
 *
 * Returned as a list rather than a boolean so the form can say what is wrong
 * instead of just disabling Save — a disabled button with no explanation is the
 * worst version of this screen.
 */
export function draftProblems(
  lines: DraftLine[],
  description: string,
): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const filled = lines.filter((line) => line.accountId || line.amountText.trim());

  if (filled.length < 2) problems.push("no-lines");
  if (
    filled.some((line) => !line.accountId || !line.amountText.trim())
  ) {
    problems.push("incomplete-line");
  }
  if (
    filled.some(
      (line) =>
        line.amountText.trim() && (parseTryToKurus(line.amountText) ?? 0) <= 0,
    )
  ) {
    problems.push("zero-amount");
  }
  if (!draftTotals(filled).balanced) problems.push("unbalanced");
  if (!description.trim()) problems.push("no-description");

  return problems;
}

export const DRAFT_PROBLEM_MESSAGES: Record<DraftProblem, string> = {
  "no-lines": "A journal needs at least two lines.",
  "incomplete-line": "Every line needs both an account and an amount.",
  "zero-amount": "Amounts must be more than zero.",
  unbalanced: "Debits and credits must be equal.",
  "no-description": "Describe why this entry exists — it is the audit trail.",
};

/** The payload the API expects, or null when the draft is not postable. */
export function draftToPayload(
  lines: DraftLine[],
  description: string,
  entryDate: string,
): {
  entry_date: string;
  description: string;
  lines: { account_id: string; amount_kurus: number; side: string }[];
} | null {
  if (draftProblems(lines, description).length > 0) return null;
  return {
    entry_date: entryDate,
    description: description.trim(),
    lines: lines
      .filter((line) => line.accountId && line.amountText.trim())
      .map((line) => ({
        account_id: line.accountId,
        amount_kurus: parseTryToKurus(line.amountText)!,
        side: line.side,
      })),
  };
}
