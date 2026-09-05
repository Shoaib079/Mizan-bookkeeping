"use client";

/** Column mapping sidebar for statement import (split from StatementImportPanel). */

import {
  ColumnSelect,
  MappingAtAGlance,
} from "@/components/banking/statement-import-mapping-view";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Label } from "@/components/ui/input";
import type { BankStatementPreview } from "@/lib/banking-types";
import {
  MOBILE_TOUCH_TARGET,
} from "@/lib/mobile-shell";
import {
  DATE_FORMATS,
  STATEMENT_FILE_ACCEPT,
  sanitizeStatementMapping,
  type AmountMode,
  type CsvDelimiter,
  type CsvEncoding,
  type DateFormat,
  type DecimalFormat,
  type MappingState,
} from "@/lib/statement-import-helpers";
import { cn } from "@/lib/utils";
import type { Dispatch, SetStateAction } from "react";

const fieldControlClass = cn(
  "block h-8 w-full rounded-md border border-input bg-background px-2 text-xs",
  MOBILE_TOUCH_TARGET,
);

type Props = {
  file: File | null;
  expectedFileName: string | null;
  loadingPreview: boolean;
  preview: BankStatementPreview | null;
  mapping: MappingState;
  setMapping: Dispatch<SetStateAction<MappingState>>;
  maxCol: number;
  error: string | null;
  submitting: boolean;
  onLoadPreview: (selected: File) => void;
  onBackToPick: () => void;
};

export function StatementImportMapSidebar({
  file,
  expectedFileName,
  loadingPreview,
  preview,
  mapping,
  setMapping,
  maxCol,
  error,
  submitting,
  onLoadPreview,
  onBackToPick,
}: Props) {
  return (
    <aside
      className={cn(
        "flex flex-col rounded-lg border border-border bg-card",
        "max-[819px]:max-h-none",
        "min-[820px]:max-h-[min(85vh,720px)] xl:sticky xl:top-4 xl:self-start",
      )}
    >
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
                  if (selected) onLoadPreview(selected);
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
              className={fieldControlClass}
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
              className={fieldControlClass}
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
              className={fieldControlClass}
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
                className={fieldControlClass}
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
                className={fieldControlClass}
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
                className={fieldControlClass}
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
                className={fieldControlClass}
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
                className={fieldControlClass}
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

      {/* Desktop only — phone uses the sticky bar in StatementImportPanel.
       * Prefer flex (not DESKTOP_SHELL_ONLY's block) so the button row stays. */}
      <div className="hidden flex-wrap gap-2 border-t border-border p-3 min-[820px]:flex">
        <Button type="button" variant="secondary" onClick={onBackToPick}>
          Other file
        </Button>
        <Button type="submit" disabled={submitting || !file || loadingPreview}>
          {submitting ? "Importing…" : "Import"}
        </Button>
      </div>
    </aside>
  );
}
