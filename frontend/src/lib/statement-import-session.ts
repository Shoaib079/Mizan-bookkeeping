/** Persist bank statement import wizard across remounts (Vercel entity hydration). */

import type { BankStatementPreview } from "@/lib/banking-types";
import type { MappingState } from "@/lib/statement-import-helpers";

export type StatementImportStep = "pick" | "map";

export type StatementImportSession = {
  step: StatementImportStep;
  preview: BankStatementPreview;
  mapping: MappingState;
  fileName: string;
  fileSize: number;
  fileLastModified: number;
};

export type StatementImportPending = {
  fileName: string;
  fileSize: number;
  fileLastModified: number;
};

export function statementImportPendingKey(storageKey: string): string {
  return `${storageKey}:pending`;
}

export function readStatementImportPending(
  storageKey: string,
): StatementImportPending | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(statementImportPendingKey(storageKey));
    if (!raw) return null;
    return JSON.parse(raw) as StatementImportPending;
  } catch {
    return null;
  }
}

export function writeStatementImportPending(
  storageKey: string,
  pending: StatementImportPending,
): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    statementImportPendingKey(storageKey),
    JSON.stringify(pending),
  );
}

export function clearStatementImportPending(storageKey: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(statementImportPendingKey(storageKey));
}

export function pendingMatchesFile(
  pending: StatementImportPending,
  file: File,
): boolean {
  return (
    file.name === pending.fileName &&
    file.size === pending.fileSize &&
    file.lastModified === pending.fileLastModified
  );
}

export function pendingFileMeta(
  pending: StatementImportPending,
): { name: string; size: number; lastModified: number } {
  return {
    name: pending.fileName,
    size: pending.fileSize,
    lastModified: pending.fileLastModified,
  };
}

export function statementImportStorageKey(
  entityId: string,
  moneyAccountId: string,
): string {
  return `mizan.statementImport.v1:${entityId}:${moneyAccountId}`;
}

export function fileMatchesSession(
  file: File,
  session: StatementImportSession,
): boolean {
  return (
    file.name === session.fileName &&
    file.size === session.fileSize &&
    file.lastModified === session.fileLastModified
  );
}

export function readStatementImportSession(
  storageKey: string,
): StatementImportSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StatementImportSession;
    if (parsed.step !== "map") return null;
    if (!parsed.preview?.rows?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStatementImportSession(
  storageKey: string,
  session: StatementImportSession,
): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(storageKey, JSON.stringify(session));
}

export function clearStatementImportSession(storageKey: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(storageKey);
  clearStatementImportPending(storageKey);
}
