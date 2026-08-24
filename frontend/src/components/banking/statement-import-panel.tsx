"use client";

/** Full-page bank statement upload + column mapping. */

import { StatementImportMapPreview } from "@/components/banking/statement-import-map-preview";
import { StatementImportMapSidebar } from "@/components/banking/statement-import-map-sidebar";
import { StatementImportPickStep } from "@/components/banking/statement-import-pick-step";
import { useStatementImport } from "@/components/banking/use-statement-import";
import { formatTry } from "@/lib/money";

type Props = {
  moneyAccountId: string;
  accountName?: string;
};

export function StatementImportPanel({
  moneyAccountId,
  accountName,
}: Props) {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">
          Import bank statement
          {accountName ? ` — ${accountName}` : ""}
        </h1>
      </div>

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

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
            <StatementImportMapPreview
              fileName={file?.name}
              preview={preview}
              mapping={mapping}
              maxCol={maxCol}
              assignTarget={assignTarget}
              onAssignTargetChange={setAssignTarget}
              onAssignColumn={handleAssignColumn}
            />
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
        </form>
      )}
    </div>
  );
}
