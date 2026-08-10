"use client";

/** Full-page bank statement upload + column mapping. */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ColumnSelect,
  MappingAtAGlance,
  StatementPreviewTable,
} from "@/components/banking/statement-import-mapping-view";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error-message";
import type {
  BankStatementPreview,
  BankStatementRead,
} from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import {
  applyColumnAssignment,
  COLUMN_ASSIGN_ROLES,
  DATE_FORMATS,
  DEFAULT_MAPPING,
  mappingToProfilePayload,
  sanitizeStatementMapping,
  statementImportSessionKey,
  STATEMENT_FILE_ACCEPT,
  type AmountMode,
  type ColumnAssignRole,
  type CsvDelimiter,
  type CsvEncoding,
  type DateFormat,
  type DecimalFormat,
  type MappingState,
} from "@/lib/statement-import-helpers";
import {
  takeStatementImportFileHandoff,
  takeStatementImportPreviewResult,
} from "@/lib/statement-import-handoff";
import { fetchStatementPreviewResult } from "@/lib/statement-import-preview-fetch";
import {
  clearStatementImportPending,
  clearStatementImportSession,
  fileMatchesSession,
  readStatementImportPending,
  readStatementImportSession,
  pendingFileMeta,
  statementImportStorageKey,
  writeStatementImportPending,
  writeStatementImportSession,
} from "@/lib/statement-import-session";
import {
  getInflightStatementPreview,
  statementPreviewInflightKey,
  trackInflightStatementPreview,
  type StatementPreviewLoadResult,
} from "@/lib/statement-import-preview-inflight";
import { useToast } from "@/lib/toast";
import { formatTry } from "@/lib/money";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { cn } from "@/lib/utils";

type Props = {
  moneyAccountId: string;
  accountName?: string;
};

export function StatementImportPanel({
  moneyAccountId,
  accountName,
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
  const [autoDetected, setAutoDetected] = useState(false);
  const [detectedClosingBalance, setDetectedClosingBalance] = useState<number | null>(
    null,
  );
  const [assignTarget, setAssignTarget] = useState<ColumnAssignRole | null>(null);
  const [expectedFileName, setExpectedFileName] = useState<string | null>(null);
  const previewRequestRef = useRef(0);
  const resumeHandoffRef = useRef<string | null>(null);
  const storageKey = entityId
    ? statementImportStorageKey(entityId, moneyAccountId)
    : "";

  const maxCol = useMemo(() => {
    if (!preview?.rows.length) return 8;
    return Math.max(...preview.rows.map((r) => r.length), 1) - 1;
  }, [preview]);

  const reset = useCallback(() => {
    previewRequestRef.current += 1;
    if (storageKey) clearStatementImportSession(storageKey);
    setFile(null);
    setPreview(null);
    setMapping(DEFAULT_MAPPING);
    setStep("pick");
    setError(null);
    setAutoDetected(false);
    setDetectedClosingBalance(null);
    setAssignTarget(null);
    setExpectedFileName(null);
    submitIdempotency.resetSubmit();
  }, [storageKey, submitIdempotency]);

  useEffect(() => {
    if (!storageKey) return;
    const saved = readStatementImportSession(storageKey);
    if (!saved) return;
    setPreview(saved.preview);
    setMapping(sanitizeStatementMapping(saved.preview, saved.mapping));
    setStep("map");
    setAutoDetected(false);
    setError(null);
    setExpectedFileName(saved.fileName);
  }, [storageKey]);

  const restoreFileFromSession = useCallback(
    (selected: File): boolean => {
      if (!storageKey) return false;
      const saved = readStatementImportSession(storageKey);
      if (!saved || !fileMatchesSession(selected, saved)) return false;
      setFile(selected);
      setPreview(saved.preview);
      setMapping(sanitizeStatementMapping(saved.preview, saved.mapping));
      setStep("map");
      setAutoDetected(false);
      setError(null);
      return true;
    },
    [storageKey],
  );

  const persistSession = useCallback(
    (
      fileMeta: { name: string; size: number; lastModified: number },
      previewRes: BankStatementPreview,
      nextMapping: MappingState,
    ) => {
      if (!storageKey) return;
      writeStatementImportSession(storageKey, {
        step: "map",
        preview: previewRes,
        mapping: nextMapping,
        fileName: fileMeta.name,
        fileSize: fileMeta.size,
        fileLastModified: fileMeta.lastModified,
      });
    },
    [storageKey],
  );

  const applyPreviewResult = useCallback(
    (
      result: StatementPreviewLoadResult,
      fileMeta: { name: string; size: number; lastModified: number },
      selectedFile: File,
    ) => {
      setFile(selectedFile);
      setAutoDetected(result.autoDetected);
      setPreview(result.preview);
      const nextMapping = sanitizeStatementMapping(result.preview, result.mapping);
      setMapping(nextMapping);
      setDetectedClosingBalance(
        result.preview.detected_closing_balance_kurus ?? null,
      );
      setStep("map");
      setExpectedFileName(fileMeta.name);
      persistSession(fileMeta, result.preview, nextMapping);
    },
    [persistSession],
  );

  const fetchPreviewResult = useCallback(
    async (selected: File): Promise<StatementPreviewLoadResult> => {
      if (!entityId) {
        throw new Error("Select a restaurant in the sidebar first.");
      }
      return fetchStatementPreviewResult(entityId, moneyAccountId, selected);
    },
    [entityId, moneyAccountId],
  );

  const awaitPreviewLoad = useCallback(
    async (
      fileMeta: { name: string; size: number; lastModified: number },
      requestId: number,
      selectedFile?: File | null,
    ): Promise<boolean> => {
      if (!storageKey) return false;
      const inflightKey = statementPreviewInflightKey(storageKey, fileMeta);
      const pending = getInflightStatementPreview(inflightKey);
      if (!pending) return false;

      setLoadingPreview(true);
      setError(null);
      try {
        const result = await pending;
        if (requestId !== previewRequestRef.current) {
          toast(
            "Preview finished but the page refreshed — try the same file again",
            "error",
          );
          return true;
        }
        if (selectedFile) {
          applyPreviewResult(result, fileMeta, selectedFile);
        } else {
          setAutoDetected(result.autoDetected);
          setPreview(result.preview);
          const nextMapping = sanitizeStatementMapping(result.preview, result.mapping);
          setMapping(nextMapping);
          setStep("map");
          persistSession(fileMeta, result.preview, nextMapping);
        }
        return true;
      } catch (err) {
        if (requestId !== previewRequestRef.current) return true;
        const message = apiErrorMessage(err, "Preview failed");
        setError(message);
        toast(message, "error");
        return true;
      } finally {
        if (storageKey) clearStatementImportPending(storageKey);
        if (requestId === previewRequestRef.current) {
          setLoadingPreview(false);
        }
      }
    },
    [storageKey, toast, applyPreviewResult, persistSession],
  );

  /** Read a chosen file and move to the mapping step.
   *
   * Declared here, above the effect that resumes an interrupted import, and
   * memoised, so that effect can name it as a dependency. It could not before:
   * a dependency array is evaluated during render, and this was defined below
   * the effect, so listing it was a reference-before-initialisation error.
   * The array therefore left it out and the lint rule complained.
   *
   * Nothing was wrong. Everything this reads that can change — `entityId`,
   * `moneyAccountId` — feeds `storageKey`, which the effect already depends
   * on, so the effect could never have captured a stale one with different
   * values. But that argument had to be made by hand, by someone who noticed
   * the derivation. Now the compiler makes it: if this grows a dependency
   * `storageKey` does not cover, the effect's array stops satisfying the rule
   * and says so.
   */
  const loadPreview = useCallback(
    async (selected: File) => {
      if (!entityId) {
        setError("Select a restaurant in the sidebar first.");
        return;
      }
      setFile(selected);
      if (restoreFileFromSession(selected)) {
        return;
      }

      if (!storageKey) return;
      const inflightKey = statementPreviewInflightKey(storageKey, selected);
      const existing = getInflightStatementPreview(inflightKey);
      const requestId = previewRequestRef.current + 1;
      previewRequestRef.current = requestId;
      setLoadingPreview(true);
      setError(null);
      writeStatementImportPending(storageKey, {
        fileName: selected.name,
        fileSize: selected.size,
        fileLastModified: selected.lastModified,
      });

      try {
        const result = await (existing ??
          trackInflightStatementPreview(
            inflightKey,
            fetchPreviewResult(selected),
          ));

        if (requestId !== previewRequestRef.current) {
          toast(
            "Preview finished but the page refreshed — try the same file again",
            "error",
          );
          return;
        }

        applyPreviewResult(result, {
          name: selected.name,
          size: selected.size,
          lastModified: selected.lastModified,
        }, selected);
      } catch (err) {
        if (requestId !== previewRequestRef.current) return;
        const message = apiErrorMessage(err, "Preview failed");
        setError(message);
        toast(message, "error");
      } finally {
        if (storageKey) clearStatementImportPending(storageKey);
        if (requestId === previewRequestRef.current) {
          setLoadingPreview(false);
        }
      }
    },
    [
      entityId,
      storageKey,
      restoreFileFromSession,
      fetchPreviewResult,
      applyPreviewResult,
      toast,
    ],
  );

  function handleAssignColumn(colIdx: number) {
    if (!assignTarget) return;
    setMapping((m) => applyColumnAssignment(m, assignTarget, colIdx));
    setAssignTarget(null);
  }

  useEntitySwitchReset(
    statementImportSessionKey(entityId, moneyAccountId),
    reset,
  );

  useEffect(() => {
    resumeHandoffRef.current = null;
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || preview) return;
    if (resumeHandoffRef.current === storageKey) return;

    const saved = readStatementImportSession(storageKey);
    if (saved) return;

    const handoffFile = takeStatementImportFileHandoff(storageKey);
    if (handoffFile) {
      resumeHandoffRef.current = storageKey;
      const completed = takeStatementImportPreviewResult(storageKey);
      const fileMeta = {
        name: handoffFile.name,
        size: handoffFile.size,
        lastModified: handoffFile.lastModified,
      };
      if (completed) {
        clearStatementImportPending(storageKey);
        applyPreviewResult(completed, fileMeta, handoffFile);
        return;
      }
      void loadPreview(handoffFile);
      return;
    }

    const pending = readStatementImportPending(storageKey);
    if (!pending) return;

    const inflightKey = statementPreviewInflightKey(
      storageKey,
      pendingFileMeta(pending),
    );
    if (!getInflightStatementPreview(inflightKey)) return;

    resumeHandoffRef.current = storageKey;
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    void awaitPreviewLoad(pendingFileMeta(pending), requestId, null);
  }, [storageKey, preview, applyPreviewResult, awaitPreviewLoad, loadPreview]);

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
      if (storageKey) clearStatementImportSession(storageKey);
      const skipped = statement.skipped_duplicate_count ?? 0;
      if (skipped > 0) {
        toast(
          `Statement imported — ${statement.line_count} new line${statement.line_count === 1 ? "" : "s"}, ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped`,
        );
      } else {
        toast("Statement imported");
      }
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
        <h1 className="text-lg font-semibold">
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
                if (selected) void loadPreview(selected);
                else setFile(null);
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
          {detectedClosingBalance !== null && (
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
              Closing balance read from statement:{" "}
              <strong>{formatTry(detectedClosingBalance)}</strong> — saved on
              import for bank reconciliation (map the <strong>Bakiye</strong>{" "}
              column if this looks wrong).
            </p>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
            <section className="min-w-0 space-y-3">
              <div>
                <h2 className="text-sm font-semibold">File preview</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {file?.name} · {preview?.total_rows ?? 0} rows
                  {preview && preview.rows.length >= preview.total_rows
                    ? " · full file shown"
                    : ` · showing first ${preview?.rows.length ?? 0}`}
                  . The <strong>Header</strong> row under each letter shows what your
                  bank put in that column.
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

                <div className="space-y-1.5 rounded-md border border-border bg-muted/20 p-2.5">
                  <Label className="text-xs font-medium" htmlFor="stmt-file-map">
                    Statement file
                  </Label>
                  {file ? (
                    <p className="text-xs text-muted-foreground">
                      {file.name} · ready to import
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        {expectedFileName
                          ? `Select ${expectedFileName} again to enable Import.`
                          : "Select the statement file again to enable Import."}
                      </p>
                      <FileUpload
                        id="stmt-file-map"
                        accept={STATEMENT_FILE_ACCEPT}
                        disabled={loadingPreview}
                        file={null}
                        acceptHint="CSV or Excel"
                        onFileChange={(selected) => {
                          if (selected) void loadPreview(selected);
                        }}
                      />
                    </>
                  )}
                  {loadingPreview && (
                    <p className="text-xs text-muted-foreground">Loading preview…</p>
                  )}
                </div>

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
                  <div className="col-span-2 space-y-0.5">
                    <Label className="text-xs">Last data row (optional)</Label>
                    <input
                      type="number"
                      min={1}
                      placeholder="All rows to end of file"
                      className="block h-8 w-full rounded-md border border-input px-2 text-xs"
                      value={mapping.dataEndRow ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        setMapping((m) => ({
                          ...m,
                          dataEndRow: raw === "" ? null : Number(raw),
                        }));
                      }}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Last transaction row when the bank adds balance or summary
                      lines below. Leave empty to scan to the end — zero-amount
                      footer rows are skipped automatically.
                    </p>
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
                    <p className="text-[11px] text-muted-foreground -mt-1">
                      A second description column (e.g. Detay) is merged automatically
                      when the bank splits text — map Bakiye separately below, not here.
                    </p>
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
                    <ColumnSelect
                      label="Bakiye / running balance (optional)"
                      value={mapping.balanceCol}
                      maxCol={maxCol}
                      preview={preview}
                      headerRow={mapping.headerRow}
                      dataStartRow={mapping.dataStartRow}
                      allowEmpty
                      onChange={(v) =>
                        setMapping((m) =>
                          sanitizeStatementMapping(preview, { ...m, balanceCol: v }),
                        )
                      }
                    />
                    <p className="text-[11px] text-muted-foreground -mt-1">
                      Per-row balance column (Bakiye / Güncel Bakiye) — used only for
                      stated closing on the statement, not merged into descriptions.
                    </p>

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
                    if (storageKey) clearStatementImportSession(storageKey);
                    setStep("pick");
                    setFile(null);
                    setPreview(null);
                    setAssignTarget(null);
                    setExpectedFileName(null);
                  }}
                >
                  Other file
                </Button>
                <Button type="submit" disabled={submitting || !file || loadingPreview}>
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
