/** Run classify / correct across multiple statement lines (one API call each). */

import type {
  BankStatementLine,
  ClassifyStatementLineResult,
  StatementLineClassification,
} from "@/lib/banking-types";
import {
  buildClassifyLinePayload,
} from "@/lib/statement-classify-payload";
import type { StatementLineFormTargets } from "@/lib/statement-line-form-state";
import {
  classifyStatementLine,
  correctStatementLine,
} from "@/lib/statement-review-actions";
import type { StatementBulkMode } from "@/lib/statement-bulk-selection";

export type BulkLineFailure = {
  lineId: string;
  description: string;
  error: string;
};

export type BulkRunResult = {
  succeeded: ClassifyStatementLineResult[];
  failed: BulkLineFailure[];
};

export async function runStatementBulkAction(args: {
  entityId: string;
  lines: BankStatementLine[];
  mode: StatementBulkMode;
  actorId: string;
  classification: StatementLineClassification;
  targets: StatementLineFormTargets;
  learnAs?: string;
  correctReason?: string;
  onLineDone?: (result: ClassifyStatementLineResult) => void;
  onProgress?: (completed: number, total: number) => void;
}): Promise<BulkRunResult> {
  const {
    entityId,
    lines,
    mode,
    actorId,
    classification,
    targets,
    learnAs,
    correctReason,
    onLineDone,
    onProgress,
  } = args;

  const succeeded: ClassifyStatementLineResult[] = [];
  const failed: BulkLineFailure[] = [];
  const total = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const payload = buildClassifyLinePayload(line, {
      actorId,
      classification,
      targets,
      learnAs,
    });
    const idempotencyKey = crypto.randomUUID();

    try {
      const result =
        mode === "post"
          ? await classifyStatementLine(
              entityId,
              line.statement_id,
              line.id,
              payload,
              idempotencyKey,
            )
          : await correctStatementLine(
              entityId,
              line.statement_id,
              line.id,
              {
                ...payload,
                reason: correctReason?.trim() ?? "",
              },
              idempotencyKey,
            );
      succeeded.push(result);
      onLineDone?.(result);
    } catch (err) {
      failed.push({
        lineId: line.id,
        description: line.description,
        error: err instanceof Error ? err.message : "Request failed",
      });
    }

    onProgress?.(index + 1, total);
  }

  return { succeeded, failed };
}
