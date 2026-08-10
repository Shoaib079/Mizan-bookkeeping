"use client";

/** The three presentational pieces of the statement import mapping step.
 *
 * A column picker, a summary of what is mapped, and the preview grid. None
 * holds state or talks to the API — they take a `MappingState` and report
 * clicks — which is what made them safe to lift out of a 1,161-line panel
 * that has no component tests. Everything that decides anything stayed put.
 */

import { useMemo } from "react";

import { Label } from "@/components/ui/input";
import type { BankStatementPreview } from "@/lib/banking-types";
import {
  colLetter,
  columnOptionLabel,
  columnSelectionHint,
  headerCellAt,
  roleForColumn,
  roleLabel,
  sampleCellAt,
  type ColumnAssignRole,
  type MappingState,
} from "@/lib/statement-import-helpers";
import { cn } from "@/lib/utils";

export function ColumnSelect({
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

export function MappingAtAGlance({
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
  rows.push({ role: "Bakiye", col: mapping.balanceCol });

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
          {mapping.dataEndRow != null ? ` · through ${mapping.dataEndRow}` : ""}
        </dd>
      </div>
    </dl>
  );
}

export function mappedColumnClass(mapping: MappingState, colIdx: number): string {
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
  if (mapping.balanceCol === colIdx) {
    return "ring-1 ring-inset ring-emerald-500/40 bg-emerald-500/5";
  }
  return "";
}

export function StatementPreviewTable({
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
            const isDataEnd =
              mapping.dataEndRow != null && rowNumber === mapping.dataEndRow;
            const isDataRow =
              rowNumber >= mapping.dataStartRow &&
              (mapping.dataEndRow == null || rowNumber <= mapping.dataEndRow);
            return (
              <tr
                key={rowIdx}
                className={cn(
                  "border-b last:border-0",
                  isHeader && "bg-primary/15",
                  isDataStart && !isHeader && "bg-emerald-500/10",
                  isDataEnd && !isHeader && "bg-amber-500/10",
                  isDataRow && !isHeader && !isDataStart && !isDataEnd && "bg-muted/30",
                )}
              >
                <td
                  className={cn(
                    "sticky left-0 z-10 bg-background px-2 py-1 font-mono text-muted-foreground",
                    isHeader && "bg-primary/20 font-semibold text-foreground",
                    isDataStart && !isHeader && "font-semibold text-foreground",
                    isDataEnd && !isHeader && "font-semibold text-foreground",
                  )}
                >
                  {rowNumber}
                  {isHeader ? " H" : isDataStart ? " D" : isDataEnd ? " E" : ""}
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
