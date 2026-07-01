/** Shared in-flight preview promises — survive StatementImportPanel remounts on Vercel. */

import type { BankStatementPreview } from "@/lib/banking-types";
import type { MappingState } from "@/lib/statement-import-helpers";

export type StatementPreviewLoadResult = {
  preview: BankStatementPreview;
  mapping: MappingState;
  autoDetected: boolean;
};

const inflight = new Map<string, Promise<StatementPreviewLoadResult>>();

export function statementPreviewInflightKey(
  storageKey: string,
  file: { name: string; size: number; lastModified: number },
): string {
  return `${storageKey}:${file.name}:${file.size}:${file.lastModified}`;
}

export function getInflightStatementPreview(
  key: string,
): Promise<StatementPreviewLoadResult> | undefined {
  return inflight.get(key);
}

export function trackInflightStatementPreview(
  key: string,
  promise: Promise<StatementPreviewLoadResult>,
): Promise<StatementPreviewLoadResult> {
  inflight.set(key, promise);
  void promise.finally(() => {
    if (inflight.get(key) === promise) {
      inflight.delete(key);
    }
  });
  return promise;
}
