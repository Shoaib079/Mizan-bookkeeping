"use client";

/** Preview grid + click-to-assign chips for statement import mapping step. */

import { StatementPreviewTable } from "@/components/banking/statement-import-mapping-view";
import type { BankStatementPreview } from "@/lib/banking-types";
import { MOBILE_TOUCH_TARGET } from "@/lib/mobile-shell";
import {
  COLUMN_ASSIGN_ROLES,
  type ColumnAssignRole,
  type MappingState,
} from "@/lib/statement-import-helpers";
import { cn } from "@/lib/utils";

type Props = {
  fileName: string | undefined;
  preview: BankStatementPreview | null;
  mapping: MappingState;
  maxCol: number;
  assignTarget: ColumnAssignRole | null;
  onAssignTargetChange: (role: ColumnAssignRole | null) => void;
  onAssignColumn: (colIdx: number) => void;
};

export function StatementImportMapPreview({
  fileName,
  preview,
  mapping,
  maxCol,
  assignTarget,
  onAssignTargetChange,
  onAssignColumn,
}: Props) {
  return (
    <section className="min-w-0 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">File preview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {fileName} · {preview?.total_rows ?? 0} rows
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
                "rounded border px-2.5 py-0.5 text-[11px] transition-colors",
                MOBILE_TOUCH_TARGET,
                "max-[819px]:inline-flex max-[819px]:items-center",
                assignTarget === role.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted",
              )}
              onClick={() =>
                onAssignTargetChange(assignTarget === role.id ? null : role.id)
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
            onClick={() => onAssignTargetChange(null)}
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
          onAssignColumn={onAssignColumn}
        />
      )}

      <p className="text-[11px] text-muted-foreground">
        <span className="font-mono">H</span> = header row ·{" "}
        <span className="font-mono">D</span> = first data row · badges
        on columns show current mapping
      </p>
    </section>
  );
}
