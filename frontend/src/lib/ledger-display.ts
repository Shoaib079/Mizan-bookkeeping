/** Operational subledger display — hide correction noise by default. */

export type SubledgerDisplayKind =
  | "effective"
  | "void_reversal"
  | "superseded";

export type SubledgerDisplayRow = {
  display_kind?: SubledgerDisplayKind;
  was_corrected?: boolean;
};

export function isEffectiveLedgerRow(row: SubledgerDisplayRow): boolean {
  return (row.display_kind ?? "effective") === "effective";
}

export function filterLedgerRows<T extends SubledgerDisplayRow>(
  rows: T[],
  showHistory: boolean,
  options?: { alwaysShow?: (row: T) => boolean },
): T[] {
  if (showHistory) return rows;
  return rows.filter(
    (row) => options?.alwaysShow?.(row) || isEffectiveLedgerRow(row),
  );
}

export function countHiddenLedgerHistory<T extends SubledgerDisplayRow>(
  rows: T[],
): number {
  return rows.filter((row) => !isEffectiveLedgerRow(row)).length;
}

export function canCorrectSubledgerRow(
  row: SubledgerDisplayRow & { journal_entry_id?: string | null },
): boolean {
  return canEditSubledgerRow(row);
}

export function canEditSubledgerRow(
  row: SubledgerDisplayRow & { journal_entry_id?: string | null },
): boolean {
  return isEffectiveLedgerRow(row) && Boolean(row.journal_entry_id);
}

export function subledgerRowClassName(
  kind: SubledgerDisplayKind | undefined,
  showHistory: boolean,
): string {
  if (!kind || kind === "effective") return "";
  return "text-muted-foreground line-through opacity-70";
}

export function journalEntryRowClassName(status: string): string {
  if (status === "voided") return "text-muted-foreground line-through opacity-70";
  return "";
}
