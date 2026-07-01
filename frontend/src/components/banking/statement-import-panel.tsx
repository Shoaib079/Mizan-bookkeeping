"use client";

/** Full-page bank statement upload + column mapping. */

import Link from "next/link";
import { FormEvent, useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error-message";
import type {
  BankImportProfileRead,
  BankStatementPreview,
  BankStatementRead,
} from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import {
  applyColumnAssignment,
  colLetter,
  columnOptionLabel,
  columnSelectionHint,
  COLUMN_ASSIGN_ROLES,
  DATE_FORMATS,
  DEFAULT_MAPPING,
  headerCellAt,
  mappingToProfilePayload,
  profileToMapping,
  roleForColumn,
  roleLabel,
  sampleCellAt,
  statementImportSessionKey,
  STATEMENT_FILE_ACCEPT,
  suggestedProfileToMapping,
  type AmountMode,
  type ColumnAssignRole,
  type CsvDelimiter,
  type CsvEncoding,
  type DateFormat,
  type DecimalFormat,
  type MappingState,
} from "@/lib/statement-import-helpers";
import { useToast } from "@/lib/toast";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { cn } from "@/lib/utils";

type Props = {
  moneyAccountId: string;
  accountName?: string;
  backHref: string;
};

function ColumnSelect({
  label,
  value,
  maxCol,
  preview,
  headerRow,
  dataStartRow,
  onChange,
  allowEmpty,
}: {
  label: string;
  value: number | null;
  maxCol: number;
  preview: BankStatementPreview;
  headerRow: number;
  dataStartRow: number;
  onChange: (v: number | null) => void;
  allowEmpty?: boolean;
}) {
  const options = useMemo(() => {
    const cols: { value: string; label: string }[] = [];
    if (allowEmpty) cols.push({ value: "", label: "— none —" });
    for (let i = 0; i <= maxCol; i++) {
      cols.push({
        value: String(i),
        label: columnOptionLabel(
          i,
          headerCellAt(preview, headerRow, i),
          sampleCellAt(preview, dataStartRow, i),
        ),
      });
    }
    return cols;
  }, [maxCol, allowEmpty, preview, headerRow, dataStartRow]);

  const hint =
    value === null
      ? null
      : columnSelectionHint(
          value,
          headerCellAt(preview, headerRow, value),
          sampleCellAt(preview, dataStartRow, value),
        );

  return (
    <div className="space-y-0.5">
      <Label className="text-xs font-medium">{label}</Label>
      <select
        className="block h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
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
      {hint && (
        <p className="truncate text-[11px] text-muted-foreground" title={hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

function MappingAtAGlance({
  mapping,
  preview,
}: {
  mapping: MappingState;
  preview: BankStatementPreview;
}) {
  const rows: { role: string; col: number | null }[] = [
    { role: "Date", col: mapping.dateCol },
    { role: "Description", col: mapping.descriptionCol },
    { role: "Reference", col: mapping.referenceCol },
  ];
  if (mapping.amountMode === "signed") {
    rows.push({ role: "Amount", col: mapping.amountCol });
  } else {
    rows.push({ role: "Borç", col: mapping.debitCol });
    rows.push({ role: "Alacak", col: mapping.creditCol });
  }

  return (
    <dl className="space-y-1 rounded-md border border-border/80 bg-muted/40 px-2.5 py-2 text-[11px]">
      <div className="mb-1 font-medium text-foreground">Your mapping</div>
      {rows.map(({ role, col }) => {
        if (col === null) {
          return (
            <div key={role} className="flex gap-2 text-muted-foreground">
              <dt className="w-20 shrink-0">{role}</dt>
              <dd>—</dd>
            </div>
          );
        }
        const header = headerCellAt(preview, mapping.headerRow, col);
        const sample = sampleCellAt(preview, mapping.dataStartRow, col);
        return (
          <div key={role} className="flex gap-2 min-w-0">
            <dt className="w-20 shrink-0 text-muted-foreground">{role}</dt>
            <dd className="min-w-0 truncate font-mono" title={`${header} ${sample}`}>
              <span className="font-semibold text-foreground">{colLetter(col)}</span>
              {header ? ` · ${header}` : ""}
              {sample ? ` · ${sample}` : ""}
            </dd>
          </div>
        );
      })}
      <div className="flex gap-2 border-t border-border/60 pt-1 text-muted-foreground">
        <dt className="w-20 shrink-0">Rows</dt>
        <dd>
          header {mapping.headerRow} · data from {mapping.dataStartRow}
        </dd>
      </div>
    </dl>
  );
}

function mappedColumnClass(mapping: MappingState, colIdx: number): string {
  if (mapping.dateCol === colIdx) return "ring-1 ring-inset ring-primary/50 bg-primary/5";
  if (mapping.descriptionCol === colIdx) return "ring-1 ring-inset ring-primary/40 bg-primary/5";
  if (mapping.referenceCol === colIdx) return "ring-1 ring-inset ring-primary/30";
  if (mapping.amountMode === "signed" && mapping.amountCol === colIdx) {
    return "ring-1 ring-inset ring-primary/50 bg-primary/5";
  }
  if (
    mapping.amountMode === "debit_credit" &&
    (mapping.debitCol === colIdx || mapping.creditCol === colIdx)
  ) {
    return "ring-1 ring-inset ring-primary/50 bg-primary/5";
  }
  return "";
}

function StatementPreviewTable({
  preview,
  mapping,
  maxCol,
  assignTarget,
  onAssignColumn,
}: {
  preview: BankStatementPreview;
  mapping: MappingState;
  maxCol: number;
  assignTarget: ColumnAssignRole | null;
  onAssignColumn: (colIdx: number) => void;
}) {
  const columnCount = maxCol + 1;
  const headerCells = preview.rows[mapping.headerRow - 1] ?? [];

  return (
    <div className="overflow-auto rounded-md border text-xs max-h-[min(60vh,520px)]">
      <table className="min-w-full border-collapse">
        <thead className="sticky top-0 z-20 bg-muted">
          <tr className="border-b">
            <th className="sticky left-0 z-30 bg-muted px-2 py-1.5 text-left font-medium">
              Row
            </th>
            {Array.from({ length: columnCount }, (_, colIdx) => {
              const role = roleForColumn(mapping, colIdx);
              const clickable = assignTarget !== null;
              return (
                <th
                  key={colIdx}
                  className={cn(
                    "px-2 py-1.5 text-left font-mono font-semibold whitespace-nowrap",
                    mappedColumnClass(mapping, colIdx),
                    clickable && "cursor-pointer hover:bg-primary/20",
                    assignTarget && "ring-1 ring-inset ring-amber-400/60",
                  )}
                  onClick={clickable ? () => onAssignColumn(colIdx) : undefined}
                  title={
                    clickable
                      ? `Set column ${colLetter(colIdx)} as ${roleLabel(assignTarget)}`
                      : role
                        ? `Mapped as ${roleLabel(role)}`
                        : undefined
                  }
                >
                  {colLetter(colIdx)}
                  {role && (
                    <span className="ml-1 rounded bg-primary/15 px-1 text-[10px] font-normal text-primary">
                      {roleLabel(role)}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
          <tr className="border-b bg-muted/80">
            <th className="sticky left-0 z-30 bg-muted/80 px-2 py-1 text-left text-[10px] font-normal text-muted-foreground">
              Header
            </th>
            {Array.from({ length: columnCount }, (_, colIdx) => (
              <th
                key={colIdx}
                className={cn(
                  "max-w-[8rem] truncate px-2 py-1 text-left text-[10px] font-normal text-muted-foreground",
                  mappedColumnClass(mapping, colIdx),
                )}
                title={headerCells[colIdx] ?? ""}
              >
                {headerCells[colIdx]?.trim() || "·"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, rowIdx) => {
            const rowNumber = rowIdx + 1;
            const isHeader = rowNumber === mapping.headerRow;
            const isDataStart = rowNumber === mapping.dataStartRow;
            const isDataRow = rowNumber >= mapping.dataStartRow;
            return (
              <tr
                key={rowIdx}
                className={cn(
                  "border-b last:border-0",
                  isHeader && "bg-primary/15",
                  isDataStart && !isHeader && "bg-emerald-500/10",
                  isDataRow && !isHeader && !isDataStart && "bg-muted/30",
                )}
              >
                <td
                  className={cn(
                    "sticky left-0 z-10 bg-background px-2 py-1 font-mono text-muted-foreground",
                    isHeader && "bg-primary/20 font-semibold text-foreground",
                    isDataStart && !isHeader && "font-semibold text-foreground",
                  )}
                >
                  {rowNumber}
                  {isHeader ? " H" : isDataStart ? " D" : ""}
                </td>
                {Array.from({ length: columnCount }, (_, colIdx) => (
                  <td
                    key={colIdx}
                    className={cn(
                      "px-2 py-1 whitespace-nowrap",
                      mappedColumnClass(mapping, colIdx),
                    )}
                  >
                    {row[colIdx] || "·"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StatementImportPanel({
  moneyAccountId,
  accountName,
  backHref,
}: Props) {
  const router = useRouter();
  const { entityId, entitiesLoaded } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BankStatementPreview | null>(null);
  const [mapping, setMapping] = useState<MappingState>(DEFAULT_MAPPING);
  const [step, setStep] = useState<"pick" | "map">("pick");
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [assignTarget, setAssignTarget] = useState<ColumnAssignRole | null>(null);
  const previewRequestRef = useRef(0);

  const maxCol = useMemo(() => {
    if (!preview?.rows.length) return 8;
    return Math.max(...preview.rows.map((r) => r.length), 1) - 1;
  }, [preview]);

  const reset = useCallback(() => {
    previewRequestRef.current += 1;
    setFile(null);
    setPreview(null);
    setMapping(DEFAULT_MAPPING);
    setStep("pick");
    setError(null);
    setAutoDetected(false);
    setAssignTarget(null);
    submitIdempotency.resetSubmit();
  }, [submitIdempotency]);

  function handleAssignColumn(colIdx: number) {
    if (!assignTarget) return;
    setMapping((m) => applyColumnAssignment(m, assignTarget, colIdx));
    setAssignTarget(null);
  }

  useEntitySwitchReset(
    statementImportSessionKey(entityId, moneyAccountId),
    reset,
    { ready: entitiesLoaded },
  );

  async function loadPreview(selected: File) {
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
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

      if (requestId !== previewRequestRef.current) return;

      if (!previewRes.rows?.length) {
        throw new Error(
          "Could not read any rows from this file — check the format is CSV or Excel",
        );
      }

      setPreview(previewRes);
      const csvEncoding = (previewRes.csv_encoding ?? "auto") as CsvEncoding;
      const csvDelimiter = (previewRes.csv_delimiter ?? "auto") as CsvDelimiter;
      if (profileRes) {
        setMapping(profileToMapping(profileRes));
        setAutoDetected(false);
      } else if (previewRes.suggested_profile) {
        setMapping(
          suggestedProfileToMapping(
            previewRes.suggested_profile,
            csvEncoding,
            csvDelimiter,
          ),
        );
        setAutoDetected(true);
      } else {
        setMapping({
          ...DEFAULT_MAPPING,
          csvEncoding,
          csvDelimiter,
        });
        setAutoDetected(false);
      }
      setStep("map");
    } catch (err) {
      if (requestId !== previewRequestRef.current) return;
      const message = apiErrorMessage(err, "Preview failed");
      setError(message);
      toast(message, "error");
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
      toast("Statement imported");
      router.push(`/banking/statements/${statement.id}`);
    } catch (err) {
      const message = apiErrorMessage(err, "Upload failed");
      setError(message);
      toast(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar first.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-primary hover:underline">
          ← Back to account
        </Link>
        <h1 className="mt-2 text-lg font-semibold">
          Import bank statement
          {accountName ? ` — ${accountName}` : ""}
        </h1>
      </div>

      {step === "pick" ? (
        <div className="max-w-xl space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload a CSV or Excel export from your bank. We scan the file for
            Turkish headers (Tarih, Açıklama, Borç/Alacak) and open a full-page
            preview so you can confirm where data starts.
          </p>
          <div>
            <Label htmlFor="stmt-file">Statement file</Label>
            <FileUpload
              id="stmt-file"
              accept={STATEMENT_FILE_ACCEPT}
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
        <form onSubmit={onSubmit} className="space-y-6">
          {autoDetected && (
            <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              Columns auto-detected (Tarih, Borç/Alacak, etc.). Check the
              preview — adjust header row and column letters if needed.
            </p>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
            <section className="min-w-0 space-y-3">
              <div>
                <h2 className="text-sm font-semibold">File preview</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {file?.name} · {preview?.total_rows ?? 0} rows · showing first{" "}
                  {preview?.rows.length ?? 0}. The <strong>Header</strong> row
                  under each letter shows what your bank put in that column.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">
                  Pick field, then click a column letter:
                </span>
                {COLUMN_ASSIGN_ROLES.map((role) => {
                  const hidden =
                    role.id === "amount" && mapping.amountMode === "debit_credit";
                  const hiddenDebit =
                    (role.id === "debit" || role.id === "credit") &&
                    mapping.amountMode === "signed";
                  if (hidden || hiddenDebit) return null;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      className={cn(
                        "rounded border px-2 py-0.5 text-[11px] transition-colors",
                        assignTarget === role.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted",
                      )}
                      onClick={() =>
                        setAssignTarget((current) =>
                          current === role.id ? null : role.id,
                        )
                      }
                    >
                      {role.label}
                    </button>
                  );
                })}
                {assignTarget && (
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground underline"
                    onClick={() => setAssignTarget(null)}
                  >
                    Cancel
                  </button>
                )}
              </div>

              {preview && preview.rows.length === 0 && (
                <p className="text-sm text-destructive">
                  No rows to preview — try another file or check CSV/Excel encoding.
                </p>
              )}

              {preview && preview.rows.length > 0 && (
                <StatementPreviewTable
                  preview={preview}
                  mapping={mapping}
                  maxCol={maxCol}
                  assignTarget={assignTarget}
                  onAssignColumn={handleAssignColumn}
                />
              )}

              <p className="text-[11px] text-muted-foreground">
                <span className="font-mono">H</span> = header row ·{" "}
                <span className="font-mono">D</span> = first data row · badges
                on columns show current mapping
              </p>
            </section>

            <aside className="flex max-h-[min(85vh,720px)] flex-col rounded-lg border border-border bg-card xl:sticky xl:top-4 xl:self-start">
              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                <h2 className="text-sm font-semibold">Column mapping</h2>

                {preview && <MappingAtAGlance mapping={mapping} preview={preview} />}

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-xs">Header row</Label>
                    <input
                      type="number"
                      min={1}
                      className="block h-8 w-full rounded-md border border-input px-2 text-xs"
                      value={mapping.headerRow}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, headerRow: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-xs">First data row</Label>
                    <input
                      type="number"
                      min={1}
                      className="block h-8 w-full rounded-md border border-input px-2 text-xs"
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

                {preview && (
                  <>
                    <ColumnSelect
                      label="Date"
                      value={mapping.dateCol}
                      maxCol={maxCol}
                      preview={preview}
                      headerRow={mapping.headerRow}
                      dataStartRow={mapping.dataStartRow}
                      onChange={(v) => v != null && setMapping((m) => ({ ...m, dateCol: v }))}
                    />
                    <ColumnSelect
                      label="Description"
                      value={mapping.descriptionCol}
                      maxCol={maxCol}
                      preview={preview}
                      headerRow={mapping.headerRow}
                      dataStartRow={mapping.dataStartRow}
                      onChange={(v) =>
                        v != null && setMapping((m) => ({ ...m, descriptionCol: v }))
                      }
                    />
                    <ColumnSelect
                      label="Reference (optional)"
                      value={mapping.referenceCol}
                      maxCol={maxCol}
                      preview={preview}
                      headerRow={mapping.headerRow}
                      dataStartRow={mapping.dataStartRow}
                      allowEmpty
                      onChange={(v) => setMapping((m) => ({ ...m, referenceCol: v }))}
                    />

                    <div className="space-y-0.5">
                      <Label className="text-xs">Amount layout</Label>
                      <select
                        className="block h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                        value={mapping.amountMode}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            amountMode: e.target.value as AmountMode,
                          }))
                        }
                      >
                        <option value="signed">Single signed amount</option>
                        <option value="debit_credit">Borç / Alacak columns</option>
                      </select>
                    </div>

                    {mapping.amountMode === "signed" ? (
                      <ColumnSelect
                        label="Amount"
                        value={mapping.amountCol}
                        maxCol={maxCol}
                        preview={preview}
                        headerRow={mapping.headerRow}
                        dataStartRow={mapping.dataStartRow}
                        onChange={(v) => setMapping((m) => ({ ...m, amountCol: v }))}
                      />
                    ) : (
                      <div className="space-y-2">
                        <ColumnSelect
                          label="Borç (debit)"
                          value={mapping.debitCol}
                          maxCol={maxCol}
                          preview={preview}
                          headerRow={mapping.headerRow}
                          dataStartRow={mapping.dataStartRow}
                          onChange={(v) => setMapping((m) => ({ ...m, debitCol: v }))}
                        />
                        <ColumnSelect
                          label="Alacak (credit)"
                          value={mapping.creditCol}
                          maxCol={maxCol}
                          preview={preview}
                          headerRow={mapping.headerRow}
                          dataStartRow={mapping.dataStartRow}
                          onChange={(v) => setMapping((m) => ({ ...m, creditCol: v }))}
                        />
                        <label className="flex items-center gap-2 text-[11px]">
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
                          Borç is outflow
                        </label>
                      </div>
                    )}
                  </>
                )}

                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Date, CSV &amp; format options
                  </summary>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="col-span-2 space-y-0.5">
                      <Label className="text-xs">Date format</Label>
                      <select
                        className="block h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
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
                    <div className="space-y-0.5">
                      <Label className="text-xs">Decimals</Label>
                      <select
                        className="block h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                        value={mapping.decimalFormat}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            decimalFormat: e.target.value as DecimalFormat,
                          }))
                        }
                      >
                        <option value="tr">TR (1.234,56)</option>
                        <option value="us">US (1,234.56)</option>
                      </select>
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-xs">Encoding</Label>
                      <select
                        className="block h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                        value={mapping.csvEncoding}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            csvEncoding: e.target.value as CsvEncoding,
                          }))
                        }
                      >
                        <option value="auto">Auto</option>
                        <option value="utf-8-sig">UTF-8</option>
                        <option value="cp1254">Windows-1254</option>
                        <option value="latin-1">Latin-1</option>
                      </select>
                    </div>
                    <div className="col-span-2 space-y-0.5">
                      <Label className="text-xs">Delimiter</Label>
                      <select
                        className="block h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                        value={mapping.csvDelimiter}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            csvDelimiter: e.target.value as CsvDelimiter,
                          }))
                        }
                      >
                        <option value="auto">Auto</option>
                        <option value=";">Semicolon</option>
                        <option value=",">Comma</option>
                        <option value={"\t"}>Tab</option>
                      </select>
                    </div>
                  </div>
                </details>

                <label className="flex items-center gap-2 text-[11px]">
                  <input
                    type="checkbox"
                    checked={mapping.saveProfile}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, saveProfile: e.target.checked }))
                    }
                  />
                  Save mapping for this account
                </label>

                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border p-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setStep("pick");
                    setFile(null);
                    setPreview(null);
                    setAssignTarget(null);
                  }}
                >
                  Other file
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Importing…" : "Import"}
                </Button>
              </div>
            </aside>
          </div>
        </form>
      )}
    </div>
  );
}
