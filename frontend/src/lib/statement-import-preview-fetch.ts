/** POST statement file for column-mapping preview + import profile hints. */

import { apiFetch } from "@/lib/api";
import type {
  BankImportProfileRead,
  BankStatementPreview,
} from "@/lib/banking-types";
import {
  DEFAULT_MAPPING,
  profileToMapping,
  suggestedProfileToMapping,
  type CsvDelimiter,
  type CsvEncoding,
  type MappingState,
} from "@/lib/statement-import-helpers";
import type { StatementPreviewLoadResult } from "@/lib/statement-import-preview-inflight";

export async function fetchStatementPreviewResult(
  entityId: string,
  moneyAccountId: string,
  selected: File,
): Promise<StatementPreviewLoadResult> {
  const body = new FormData();
  body.append("file", selected);

  const [previewRes, profileRes] = await Promise.all([
    apiFetch<BankStatementPreview>(
      `/entities/${entityId}/banking/accounts/${moneyAccountId}/statements/preview`,
      { method: "POST", body },
    ),
    apiFetch<BankImportProfileRead>(
      `/entities/${entityId}/banking/accounts/${moneyAccountId}/import-profile`,
    ).catch(() => null),
  ]);

  if (!previewRes.rows?.length) {
    throw new Error(
      "Could not read any rows from this file — check the format is CSV or Excel",
    );
  }

  const csvEncoding = (previewRes.csv_encoding ?? "auto") as CsvEncoding;
  const csvDelimiter = (previewRes.csv_delimiter ?? "auto") as CsvDelimiter;
  let nextMapping: MappingState;
  let autoDetectedResult = false;
  if (profileRes) {
    nextMapping = profileToMapping(profileRes);
  } else if (previewRes.suggested_profile) {
    nextMapping = suggestedProfileToMapping(
      previewRes.suggested_profile,
      csvEncoding,
      csvDelimiter,
    );
    autoDetectedResult = true;
  } else {
    nextMapping = {
      ...DEFAULT_MAPPING,
      csvEncoding,
      csvDelimiter,
    };
  }

  return {
    preview: previewRes,
    mapping: nextMapping,
    autoDetected: autoDetectedResult,
  };
}
