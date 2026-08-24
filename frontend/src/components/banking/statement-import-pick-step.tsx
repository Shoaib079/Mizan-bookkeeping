"use client";

/** Pick-file step for bank statement import (split from StatementImportPanel). */

import { FileUpload } from "@/components/ui/file-upload";
import { Label } from "@/components/ui/input";
import { STATEMENT_FILE_ACCEPT } from "@/lib/statement-import-helpers";

type Props = {
  file: File | null;
  loadingPreview: boolean;
  error: string | null;
  onFileChange: (selected: File | null) => void;
};

export function StatementImportPickStep({
  file,
  loadingPreview,
  error,
  onFileChange,
}: Props) {
  return (
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
          onFileChange={onFileChange}
        />
      </div>
      {loadingPreview && (
        <p className="text-sm text-muted-foreground">Loading preview…</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
