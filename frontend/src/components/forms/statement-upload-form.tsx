"use client";

/** Bank statement upload with column mapping preview — TR bank exports. */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import type {
  BankImportProfileRead,
  BankStatementPreview,
  BankStatementRead,
} from "@/lib/banking-types";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";

type Props = {
  open: boolean;
  onClose: () => void;
  moneyAccountId: string;
  embedded?: boolean;
  onUploaded?: () => void;
  onStepChange?: (step: "pick" | "map") => void;
};

type DateFormat = "DD.MM.YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
type DecimalFormat = "tr" | "us";
type CsvEncoding = "auto" | "utf-8-sig" | "cp1254" | "latin-1";
type CsvDelimiter = "auto" | ";" | "," | "\t";
type AmountMode = "signed" | "debit_credit";

type MappingState = {
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

const ACCEPT =
  ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

const DATE_FORMATS: DateFormat[] = ["DD.MM.YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];

const DEFAULT_MAPPING: MappingState = {
  headerRow: 1,
  dataStartRow: 2,
  dateCol: 0,
  descriptionCol: 1,
  referenceCol: null,
  amountMode: "signed",
  amountCol: 2,
  debitCol: 3,
  creditCol: 4,
  dateFormat: "YYYY-MM-DD",
  decimalFormat: "tr",
  csvEncoding: "auto",
  csvDelimiter: "auto",
  debitIsOutflow: true,
  saveProfile: true,
};

function colLabel(index: number): string {
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${label} (${index})`;
}

function profileToMapping(profile: BankImportProfileRead): MappingState {
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

function mappingToProfilePayload(mapping: MappingState) {
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

function ColumnSelect({
  label,
  value,
  maxCol,
  onChange,
  allowEmpty,
}: {
  label: string;
  value: number | null;
  maxCol: number;
  onChange: (v: number | null) => void;
  allowEmpty?: boolean;
}) {
  const options = useMemo(() => {
    const cols: { value: string; label: string }[] = [];
    if (allowEmpty) cols.push({ value: "", label: "— none —" });
    for (let i = 0; i <= maxCol; i++) {
      cols.push({ value: String(i), label: colLabel(i) });
    }
    return cols;
  }, [maxCol, allowEmpty]);

  return (
    <div>
      <Label>{label}</Label>
      <select
        className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        value={value === null ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? null : Number(raw));
        }}
      >
        {options.map((opt) => (
          <option key={opt.value || "empty"} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function StatementUploadForm({
  open,
  onClose,
  moneyAccountId,
  embedded,
  onUploaded,
  onStepChange,
}: Props) {
  const router = useRouter();
  const { entityId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BankStatementPreview | null>(null);
  const [mapping, setMapping] = useState<MappingState>(DEFAULT_MAPPING);
  const [step, setStep] = useState<"pick" | "map">("pick");
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const maxCol = useMemo(() => {
    if (!preview?.rows.length) return 8;
    return Math.max(...preview.rows.map((r) => r.length), 1) - 1;
  }, [preview]);

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setMapping(DEFAULT_MAPPING);
    setStep("pick");
    setError(null);
  }, []);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
    else reset();
  }, [open, submitIdempotency, reset]);

  useEffect(() => {
    if (open) onStepChange?.(step);
  }, [open, step, onStepChange]);

  async function loadPreview(selected: File) {
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    setLoadingPreview(true);
    setError(null);
    try {
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

      setPreview(previewRes);
      if (profileRes) {
        setMapping(profileToMapping(profileRes));
      } else {
        setMapping({
          ...DEFAULT_MAPPING,
          csvEncoding: (previewRes.csv_encoding ?? "auto") as CsvEncoding,
          csvDelimiter: (previewRes.csv_delimiter ?? "auto") as CsvDelimiter,
        });
      }
      setStep("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
      setFile(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !file) return;

    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("profile", JSON.stringify(mappingToProfilePayload(mapping)));
      body.append("save_profile", mapping.saveProfile ? "true" : "false");

      const idempotencyKey = submitIdempotency.beginSubmit();
      const statement = await apiFetch<BankStatementRead>(
        `/entities/${entityId}/banking/accounts/${moneyAccountId}/statements`,
        { method: "POST", body, idempotencyKey },
      );
      submitIdempotency.completeSubmit();
      onUploaded?.();
      toast("Statement imported");
      onClose();
      reset();
      router.push(`/banking/statements/${statement.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialogShell
      embedded={embedded}
      open={open}
      title={step === "pick" ? "Upload bank statement" : "Map columns"}
      onClose={onClose}
    >
      {step === "pick" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload a CSV or Excel export from your bank. You will map columns on
            the next step — saved mappings auto-apply for this account.
          </p>
          <div>
            <Label htmlFor="stmt-file">Statement file</Label>
            <FileUpload
              id="stmt-file"
              accept={ACCEPT}
              disabled={loadingPreview}
              file={file}
              acceptHint="CSV or Excel"
              onFileChange={(selected) => {
                setFile(selected);
                if (selected) void loadPreview(selected);
              }}
            />
          </div>
          {loadingPreview && (
            <p className="text-sm text-muted-foreground">Loading preview…</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <p className="text-sm text-muted-foreground">
            File: {file?.name} ({preview?.total_rows ?? 0} rows). Row numbers
            are 1-based. Columns are 0-based (first column = 0).
          </p>

          {preview && preview.rows.length > 0 && (
            <div className="overflow-x-auto rounded-md border text-xs">
              <table className="min-w-full border-collapse">
                <tbody>
                  {preview.rows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="border-b last:border-0">
                      <td className="bg-muted px-2 py-1 font-mono text-muted-foreground">
                        {rowIdx + 1}
                      </td>
                      {row.map((cell, colIdx) => (
                        <td key={colIdx} className="px-2 py-1 whitespace-nowrap">
                          {cell || "·"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Header row</Label>
              <input
                type="number"
                min={1}
                className="mt-1 block w-full rounded-md border border-input px-2 py-1.5 text-sm"
                value={mapping.headerRow}
                onChange={(e) =>
                  setMapping((m) => ({ ...m, headerRow: Number(e.target.value) }))
                }
              />
            </div>
            <div>
              <Label>First data row</Label>
              <input
                type="number"
                min={1}
                className="mt-1 block w-full rounded-md border border-input px-2 py-1.5 text-sm"
                value={mapping.dataStartRow}
                onChange={(e) =>
                  setMapping((m) => ({
                    ...m,
                    dataStartRow: Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ColumnSelect
              label="Date column"
              value={mapping.dateCol}
              maxCol={maxCol}
              onChange={(v) => v != null && setMapping((m) => ({ ...m, dateCol: v }))}
            />
            <ColumnSelect
              label="Description column"
              value={mapping.descriptionCol}
              maxCol={maxCol}
              onChange={(v) =>
                v != null && setMapping((m) => ({ ...m, descriptionCol: v }))
              }
            />
            <ColumnSelect
              label="Reference column (optional)"
              value={mapping.referenceCol}
              maxCol={maxCol}
              allowEmpty
              onChange={(v) => setMapping((m) => ({ ...m, referenceCol: v }))}
            />
          </div>

          <div>
            <Label>Amount layout</Label>
            <select
              className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={mapping.amountMode}
              onChange={(e) =>
                setMapping((m) => ({
                  ...m,
                  amountMode: e.target.value as AmountMode,
                }))
              }
            >
              <option value="signed">Single signed amount column</option>
              <option value="debit_credit">Separate Borç / Alacak columns</option>
            </select>
          </div>

          {mapping.amountMode === "signed" ? (
            <ColumnSelect
              label="Amount column (signed lira)"
              value={mapping.amountCol}
              maxCol={maxCol}
              onChange={(v) => setMapping((m) => ({ ...m, amountCol: v }))}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <ColumnSelect
                label="Debit / Borç column"
                value={mapping.debitCol}
                maxCol={maxCol}
                onChange={(v) => setMapping((m) => ({ ...m, debitCol: v }))}
              />
              <ColumnSelect
                label="Credit / Alacak column"
                value={mapping.creditCol}
                maxCol={maxCol}
                onChange={(v) => setMapping((m) => ({ ...m, creditCol: v }))}
              />
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mapping.debitIsOutflow}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      debitIsOutflow: e.target.checked,
                    }))
                  }
                />
                Debit (Borç) is outflow — negative kuruş
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date format</Label>
              <select
                className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={mapping.dateFormat}
                onChange={(e) =>
                  setMapping((m) => ({
                    ...m,
                    dateFormat: e.target.value as DateFormat,
                  }))
                }
              >
                {DATE_FORMATS.map((fmt) => (
                  <option key={fmt} value={fmt}>
                    {fmt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Decimal format</Label>
              <select
                className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={mapping.decimalFormat}
                onChange={(e) =>
                  setMapping((m) => ({
                    ...m,
                    decimalFormat: e.target.value as DecimalFormat,
                  }))
                }
              >
                <option value="tr">Turkish (1.234,56)</option>
                <option value="us">US (1,234.56)</option>
              </select>
            </div>
            <div>
              <Label>CSV encoding</Label>
              <select
                className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={mapping.csvEncoding}
                onChange={(e) =>
                  setMapping((m) => ({
                    ...m,
                    csvEncoding: e.target.value as CsvEncoding,
                  }))
                }
              >
                <option value="auto">Auto-detect</option>
                <option value="utf-8-sig">UTF-8</option>
                <option value="cp1254">Windows-1254 (Turkish)</option>
                <option value="latin-1">Latin-1</option>
              </select>
            </div>
            <div>
              <Label>CSV delimiter</Label>
              <select
                className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={mapping.csvDelimiter}
                onChange={(e) =>
                  setMapping((m) => ({
                    ...m,
                    csvDelimiter: e.target.value as CsvDelimiter,
                  }))
                }
              >
                <option value="auto">Auto-detect</option>
                <option value=";">Semicolon (;)</option>
                <option value=",">Comma (,)</option>
                <option value={"\t"}>Tab</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mapping.saveProfile}
              onChange={(e) =>
                setMapping((m) => ({ ...m, saveProfile: e.target.checked }))
              }
            />
            Save mapping for this bank account
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setStep("pick");
                setFile(null);
                setPreview(null);
              }}
            >
              Back
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Importing…" : "Import statement"}
            </Button>
          </div>
        </form>
      )}
    </FormDialogShell>
  );
}
