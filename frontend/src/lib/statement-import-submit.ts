/** POST mapped statement file — shared by StatementImportPanel hook. */

import { apiFetch } from "@/lib/api";
import type { BankStatementRead } from "@/lib/banking-types";
import {
  mappingToProfilePayload,
  type MappingState,
} from "@/lib/statement-import-helpers";

export async function submitStatementImport(args: {
  entityId: string;
  moneyAccountId: string;
  file: File;
  mapping: MappingState;
  idempotencyKey: string;
}): Promise<BankStatementRead> {
  const body = new FormData();
  body.append("file", args.file);
  body.append("profile", JSON.stringify(mappingToProfilePayload(args.mapping)));
  body.append("save_profile", args.mapping.saveProfile ? "true" : "false");

  return apiFetch<BankStatementRead>(
    `/entities/${args.entityId}/banking/accounts/${args.moneyAccountId}/statements`,
    { method: "POST", body, idempotencyKey: args.idempotencyKey },
  );
}

export function statementImportSuccessToast(
  statement: BankStatementRead,
): string {
  const skipped = statement.skipped_duplicate_count ?? 0;
  if (skipped > 0) {
    return `Statement imported — ${statement.line_count} new line${statement.line_count === 1 ? "" : "s"}, ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped`;
  }
  return "Statement imported";
}
