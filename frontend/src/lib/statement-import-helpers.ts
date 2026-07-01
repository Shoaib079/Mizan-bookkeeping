/** Shared types/helpers for bank statement column mapping. */

import type {
  BankImportProfileRead,
  BankImportProfileUpsert,
} from "@/lib/banking-types";

export type DateFormat = "DD.MM.YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
export type DecimalFormat = "tr" | "us";
export type CsvEncoding = "auto" | "utf-8-sig" | "cp1254" | "latin-1";
export type CsvDelimiter = "auto" | ";" | "," | "\t";
export type AmountMode = "signed" | "debit_credit";

export type MappingState = {
  headerRow: number;
  dataStartRow: number;
  dateCol: number;
  descriptionCol: number;
  referenceCol: number | null;
  amountMode: AmountMode;
  amountCol: number | null;
  debitCol: number | null;
  creditCol: number | null;
  dateFormat: DateFormat;
  decimalFormat: DecimalFormat;
  csvEncoding: CsvEncoding;
  csvDelimiter: CsvDelimiter;
  debitIsOutflow: boolean;
  saveProfile: boolean;
};

export const STATEMENT_FILE_ACCEPT =
  ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

/** Stable key for entity + bank account switch reset (skip first mount). */
export function statementImportSessionKey(
  entityId: string,
  moneyAccountId: string,
): string {
  return `${entityId}:${moneyAccountId}`;
}

export const DATE_FORMATS: DateFormat[] = ["DD.MM.YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];

export const DEFAULT_MAPPING: MappingState = {
  headerRow: 1,
  dataStartRow: 2,
  dateCol: 0,
  descriptionCol: 1,
  referenceCol: null,
  amountMode: "debit_credit",
  amountCol: null,
  debitCol: 2,
  creditCol: 3,
  dateFormat: "DD.MM.YYYY",
  decimalFormat: "tr",
  csvEncoding: "auto",
  csvDelimiter: "auto",
  debitIsOutflow: true,
  saveProfile: true,
};

export function colLetter(index: number): string {
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

export function colLabel(index: number): string {
  return `${colLetter(index)} (${index})`;
}

/** Header cell text from the preview grid (empty string when row not in preview). */
export function headerCellAt(
  preview: { rows: string[][] },
  headerRow: number,
  colIdx: number,
): string {
  const row = preview.rows[headerRow - 1];
  if (!row) return "";
  return (row[colIdx] ?? "").trim();
}

/** First data-row sample for a column (helps verify mapping without scrolling). */
export function sampleCellAt(
  preview: { rows: string[][] },
  dataStartRow: number,
  colIdx: number,
): string {
  const row = preview.rows[dataStartRow - 1];
  if (!row) return "";
  return (row[colIdx] ?? "").trim();
}

export function truncateCell(value: string, max = 28): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

/** Dropdown label: letter + bank header + sample from first data row. */
export function columnOptionLabel(
  colIdx: number,
  headerText: string,
  sampleText: string,
): string {
  const letter = colLetter(colIdx);
  const parts = [letter];
  if (headerText) parts.push(truncateCell(headerText, 24));
  if (sampleText) parts.push(`e.g. ${truncateCell(sampleText, 20)}`);
  return parts.join(" · ");
}

/** One-line hint under a mapping control for the current selection. */
export function columnSelectionHint(
  colIdx: number | null,
  headerText: string,
  sampleText: string,
): string | null {
  if (colIdx === null) return null;
  const letter = colLetter(colIdx);
  if (headerText && sampleText) {
    return `${letter} — ${truncateCell(headerText, 22)} · ${truncateCell(sampleText, 18)}`;
  }
  if (headerText) return `${letter} — ${truncateCell(headerText, 28)}`;
  if (sampleText) return `${letter} — e.g. ${truncateCell(sampleText, 24)}`;
  return letter;
}

export type ColumnAssignRole =
  | "date"
  | "description"
  | "reference"
  | "amount"
  | "debit"
  | "credit";

export const COLUMN_ASSIGN_ROLES: { id: ColumnAssignRole; label: string }[] = [
  { id: "date", label: "Date" },
  { id: "description", label: "Description" },
  { id: "reference", label: "Reference" },
  { id: "debit", label: "Borç" },
  { id: "credit", label: "Alacak" },
  { id: "amount", label: "Amount" },
];

export function applyColumnAssignment(
  mapping: MappingState,
  role: ColumnAssignRole,
  colIdx: number,
): MappingState {
  switch (role) {
    case "date":
      return { ...mapping, dateCol: colIdx };
    case "description":
      return { ...mapping, descriptionCol: colIdx };
    case "reference":
      return { ...mapping, referenceCol: colIdx };
    case "amount":
      return { ...mapping, amountMode: "signed", amountCol: colIdx, debitCol: null, creditCol: null };
    case "debit":
      return {
        ...mapping,
        amountMode: "debit_credit",
        amountCol: null,
        debitCol: colIdx,
      };
    case "credit":
      return {
        ...mapping,
        amountMode: "debit_credit",
        amountCol: null,
        creditCol: colIdx,
      };
    default:
      return mapping;
  }
}

export function roleForColumn(
  mapping: MappingState,
  colIdx: number,
): ColumnAssignRole | null {
  if (mapping.dateCol === colIdx) return "date";
  if (mapping.descriptionCol === colIdx) return "description";
  if (mapping.referenceCol === colIdx) return "reference";
  if (mapping.amountMode === "signed" && mapping.amountCol === colIdx) return "amount";
  if (mapping.amountMode === "debit_credit" && mapping.debitCol === colIdx) return "debit";
  if (mapping.amountMode === "debit_credit" && mapping.creditCol === colIdx) return "credit";
  return null;
}

export function roleLabel(role: ColumnAssignRole): string {
  return COLUMN_ASSIGN_ROLES.find((r) => r.id === role)?.label ?? role;
}

export function profileToMapping(profile: BankImportProfileRead): MappingState {
  const amountMode: AmountMode =
    profile.amount_col != null ? "signed" : "debit_credit";
  return {
    headerRow: profile.header_row,
    dataStartRow: profile.data_start_row,
    dateCol: profile.date_col,
    descriptionCol: profile.description_col,
    referenceCol: profile.reference_col,
    amountMode,
    amountCol: profile.amount_col,
    debitCol: profile.debit_col,
    creditCol: profile.credit_col,
    dateFormat: profile.date_format as DateFormat,
    decimalFormat: profile.decimal_format as DecimalFormat,
    csvEncoding: (profile.csv_encoding ?? "auto") as CsvEncoding,
    csvDelimiter: (profile.csv_delimiter ?? "auto") as CsvDelimiter,
    debitIsOutflow: profile.debit_is_outflow,
    saveProfile: true,
  };
}

export function suggestedProfileToMapping(
  profile: BankImportProfileUpsert,
  csvEncoding: CsvEncoding,
  csvDelimiter: CsvDelimiter,
): MappingState {
  const amountMode: AmountMode =
    profile.amount_col != null ? "signed" : "debit_credit";
  return {
    headerRow: profile.header_row,
    dataStartRow: profile.data_start_row,
    dateCol: profile.date_col,
    descriptionCol: profile.description_col,
    referenceCol: profile.reference_col,
    amountMode,
    amountCol: profile.amount_col,
    debitCol: profile.debit_col,
    creditCol: profile.credit_col,
    dateFormat: profile.date_format as DateFormat,
    decimalFormat: profile.decimal_format as DecimalFormat,
    csvEncoding: (profile.csv_encoding ?? csvEncoding) as CsvEncoding,
    csvDelimiter: (profile.csv_delimiter ?? csvDelimiter) as CsvDelimiter,
    debitIsOutflow: profile.debit_is_outflow,
    saveProfile: true,
  };
}

export function mappingToProfilePayload(mapping: MappingState) {
  return {
    header_row: mapping.headerRow,
    data_start_row: mapping.dataStartRow,
    date_col: mapping.dateCol,
    description_col: mapping.descriptionCol,
    reference_col: mapping.referenceCol,
    amount_col: mapping.amountMode === "signed" ? mapping.amountCol : null,
    debit_col: mapping.amountMode === "debit_credit" ? mapping.debitCol : null,
    credit_col: mapping.amountMode === "debit_credit" ? mapping.creditCol : null,
    date_format: mapping.dateFormat,
    decimal_format: mapping.decimalFormat,
    csv_encoding: mapping.csvEncoding,
    csv_delimiter: mapping.csvDelimiter,
    debit_is_outflow: mapping.debitIsOutflow,
  };
}
