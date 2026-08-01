/** Carry a bank statement File from Record upload into the import wizard. */

import { fetchStatementPreviewResult } from "@/lib/statement-import-preview-fetch";
import {
  statementPreviewInflightKey,
  trackInflightStatementPreview,
} from "@/lib/statement-import-preview-inflight";
import type { StatementPreviewLoadResult } from "@/lib/statement-import-preview-inflight";
import {
  clearStatementImportSession,
  statementImportStorageKey,
  writeStatementImportPending,
} from "@/lib/statement-import-session";

const fileHandoff = new Map<string, File>();
const completedPreview = new Map<string, StatementPreviewLoadResult>();

export function peekStatementImportFileHandoff(storageKey: string): File | null {
  return fileHandoff.get(storageKey) ?? null;
}

export function storeStatementImportFileHandoff(
  storageKey: string,
  file: File,
): void {
  fileHandoff.set(storageKey, file);
}

export function takeStatementImportFileHandoff(storageKey: string): File | null {
  const file = fileHandoff.get(storageKey) ?? null;
  if (file) fileHandoff.delete(storageKey);
  return file;
}

export function takeStatementImportPreviewResult(
  storageKey: string,
): StatementPreviewLoadResult | null {
  const result = completedPreview.get(storageKey) ?? null;
  if (result) completedPreview.delete(storageKey);
  return result;
}

/** Start preview + persist pending metadata before navigating to /import. */
export function beginStatementImportHandoff(params: {
  entityId: string;
  moneyAccountId: string;
  file: File;
}): void {
  const storageKey = statementImportStorageKey(
    params.entityId,
    params.moneyAccountId,
  );
  clearStatementImportSession(storageKey);
  completedPreview.delete(storageKey);
  writeStatementImportPending(storageKey, {
    fileName: params.file.name,
    fileSize: params.file.size,
    fileLastModified: params.file.lastModified,
  });
  storeStatementImportFileHandoff(storageKey, params.file);

  const inflightKey = statementPreviewInflightKey(storageKey, params.file);
  const promise = fetchStatementPreviewResult(
    params.entityId,
    params.moneyAccountId,
    params.file,
  );
  trackInflightStatementPreview(inflightKey, promise);
  void promise
    .then((result) => {
      completedPreview.set(storageKey, result);
    })
    .catch(() => {
      completedPreview.delete(storageKey);
    });
}
