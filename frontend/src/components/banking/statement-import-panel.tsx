"use client";

/** Full-page bank statement upload + column mapping. */

import { StatementImportMapPreview } from "@/components/banking/statement-import-map-preview";
import { StatementImportMapSidebar } from "@/components/banking/statement-import-map-sidebar";
import { StatementImportPickStep } from "@/components/banking/statement-import-pick-step";
import { useStatementImport } from "@/components/banking/use-statement-import";
import { Button } from "@/components/ui/button";
import { formatTry } from "@/lib/money";
import {
  MOBILE_SHELL_ONLY,
  MOBILE_TAB_BAR_OFFSET,
  MOBILE_TOUCH_TARGET,
} from "@/lib/mobile-shell";
import { cn } from "@/lib/utils";

type Props = {
  moneyAccountId: string;
};

export function StatementImportPanel({ moneyAccountId }: Props) {
  const {
    entityId,
    file,
    setFile,
    preview,
    mapping,
    setMapping,
    step,
    error,
    loadingPreview,
    submitting,
    autoDetected,
    detectedClosingBalance,
    assignTarget,
    setAssignTarget,
    expectedFileName,
    maxCol,
    loadPreview,
    handleAssignColumn,
    onSubmit,
    backToPick,
  } = useStatementImport(moneyAccountId);

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar first.
      </p>
    );
  }

  const importDisabled = submitting || !file || loadingPreview;

  return (
    <div className="space-y-6">
      {/* Title: FormPage PageHeader only — do not draw a second H1. */}

      {step === "pick" ? (
        <StatementImportPickStep
          file={file}
          loadingPreview={loadingPreview}
          error={error}
          onFileChange={(selected) => {
            if (selected) void loadPreview(selected);
            else setFile(null);
          }}
        />
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

          {/* Phone: mapping first, preview below. Desktop xl: preview | sidebar. */}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
            <div className="min-w-0 max-[819px]:order-2 min-[820px]:order-none">
              <StatementImportMapPreview
                fileName={file?.name}
                preview={preview}
                mapping={mapping}
                maxCol={maxCol}
                assignTarget={assignTarget}
                onAssignTargetChange={setAssignTarget}
                onAssignColumn={handleAssignColumn}
              />
            </div>
            <div className="min-w-0 max-[819px]:order-1 min-[820px]:order-none">
              <StatementImportMapSidebar
                file={file}
                expectedFileName={expectedFileName}
                loadingPreview={loadingPreview}
                preview={preview}
                mapping={mapping}
                setMapping={setMapping}
                maxCol={maxCol}
                error={error}
                submitting={submitting}
                onLoadPreview={(selected) => void loadPreview(selected)}
                onBackToPick={backToPick}
              />
            </div>
          </div>

          {/* Phone sticky Import — desktop keeps actions in the sidebar footer. */}
          <div
            className={cn(
              MOBILE_SHELL_ONLY,
              "sticky z-10 -mx-3.5 flex flex-wrap gap-2 border-t border-border bg-background/95 px-3.5 py-3 backdrop-blur",
              MOBILE_TAB_BAR_OFFSET,
            )}
          >
            <Button
              type="button"
              variant="secondary"
              className={cn("flex-1", MOBILE_TOUCH_TARGET)}
              onClick={backToPick}
            >
              Other file
            </Button>
            <Button
              type="submit"
              disabled={importDisabled}
              className={cn("flex-1", MOBILE_TOUCH_TARGET)}
            >
              {submitting ? "Importing…" : "Import"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
