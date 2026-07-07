/** Bulk select / post / correct helpers for bank statement lines. */

import type {
  BankStatementLine,
  StatementLineClassification,
  StatementLineReview,
} from "@/lib/banking-types";
import { classificationMatchesAmount } from "@/lib/statement-classification-options";
import { isCorrectableLine, isQueueLine } from "@/lib/statement-line-filters";

export type StatementBulkMode = "post" | "correct";

export const BULK_UNSUPPORTED_CLASSIFICATIONS = new Set<StatementLineClassification>([
  "staff_payment",
]);

export type BulkSelectionIssue =
  | "empty"
  | "mixed_modes"
  | "mixed_direction"
  | "unsupported_classification";

export function bulkModeForLines(
  lines: Array<BankStatementLine | StatementLineReview>,
): StatementBulkMode | null {
  if (lines.length === 0) return null;
  const allQueue = lines.every((line) => isQueueLine(line));
  const allCorrectable = lines.every(
    (line) => isCorrectableLine(line) && !isQueueLine(line),
  );
  if (allQueue) return "post";
  if (allCorrectable) return "correct";
  return null;
}

/** Whether this line can be ticked for bulk post or bulk correct. */
export function lineBulkMode(
  line: BankStatementLine | StatementLineReview,
): StatementBulkMode | null {
  if (isQueueLine(line)) return "post";
  if (isCorrectableLine(line)) return "correct";
  return null;
}

export function canBulkSelectLine(
  line: BankStatementLine | StatementLineReview,
): boolean {
  return lineBulkMode(line) !== null;
}

export function amountDirectionForLines(
  lines: Array<BankStatementLine | StatementLineReview>,
): "inflow" | "outflow" | "zero" | "mixed" {
  let sawIn = false;
  let sawOut = false;
  let sawZero = false;
  for (const line of lines) {
    if (line.amount_kurus > 0) sawIn = true;
    else if (line.amount_kurus < 0) sawOut = true;
    else sawZero = true;
  }
  if (sawIn && sawOut) return "mixed";
  if (sawZero && (sawIn || sawOut)) return "mixed";
  if (sawIn) return "inflow";
  if (sawOut) return "outflow";
  return "zero";
}

export function validateBulkSelection(
  lines: Array<BankStatementLine | StatementLineReview>,
  classification?: StatementLineClassification,
): { ok: true } | { ok: false; issue: BulkSelectionIssue; message: string } {
  if (lines.length === 0) {
    return {
      ok: false,
      issue: "empty",
      message: "Select at least one line.",
    };
  }

  const mode = bulkModeForLines(lines);
  if (!mode) {
    return {
      ok: false,
      issue: "mixed_modes",
      message:
        "Bulk actions need lines in the same state — all to post, or all posted/skipped to correct. Do not mix queue and posted lines.",
    };
  }

  const direction = amountDirectionForLines(lines);
  if (direction === "mixed") {
    return {
      ok: false,
      issue: "mixed_direction",
      message:
        "Selected lines mix money in and money out. Post or correct inflows and outflows separately.",
    };
  }

  if (classification && BULK_UNSUPPORTED_CLASSIFICATIONS.has(classification)) {
    return {
      ok: false,
      issue: "unsupported_classification",
      message:
        "Salary payments need the per-month salary dialog — post those one line at a time.",
    };
  }

  if (classification) {
    const mismatched = lines.filter(
      (line) => !classificationMatchesAmount(classification, line.amount_kurus),
    );
    if (mismatched.length > 0) {
      return {
        ok: false,
        issue: "mixed_direction",
        message:
          "This classification does not match every selected line direction (inflow vs outflow).",
      };
    }
  }

  return { ok: true };
}

export function isBulkSelectableLine(
  line: BankStatementLine | StatementLineReview,
  mode?: StatementBulkMode,
): boolean {
  const lineMode = lineBulkMode(line);
  if (lineMode === null) return false;
  if (mode === undefined) return true;
  return lineMode === mode;
}

export function isReviewBulkSelectableLine(line: StatementLineReview): boolean {
  return canBulkSelectLine(line);
}

export function toggleLineIdSet(
  current: ReadonlySet<string>,
  lineId: string,
  selected: boolean,
): Set<string> {
  const next = new Set(current);
  if (selected) next.add(lineId);
  else next.delete(lineId);
  return next;
}

export function toggleAllLineIds(
  current: ReadonlySet<string>,
  lineIds: string[],
  select: boolean,
): Set<string> {
  const next = new Set(current);
  for (const id of lineIds) {
    if (select) next.add(id);
    else next.delete(id);
  }
  return next;
}
