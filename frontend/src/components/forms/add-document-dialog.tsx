"use client";

/**
 * Unified "Add document" dialog (UX-C).
 * Drop a file → backend detects type → confirm or change → route to existing form.
 */

import { Upload } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FileUpload } from "@/components/ui/file-upload";
import { RecordingForBanner } from "@/components/forms/recording-for-banner";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";

export type DetectedDocumentType =
  | "invoice"
  | "bank_statement"
  | "expense_receipt"
  | "pos_daily_summary";

type DetectResult = {
  document_type: DetectedDocumentType;
  confidence: "high" | "medium" | "low";
};

const DOCUMENT_TYPE_LABELS: Record<DetectedDocumentType, string> = {
  invoice: "Supplier invoice (e-Fatura)",
  bank_statement: "Bank statement",
  expense_receipt: "Expense receipt",
  pos_daily_summary: "POS daily summary",
};

const ALL_TYPES: DetectedDocumentType[] = [
  "invoice",
  "bank_statement",
  "expense_receipt",
  "pos_daily_summary",
];

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (type: DetectedDocumentType, file: File) => void;
};

export function AddDocumentDialog({ open, onClose, onConfirm }: Props) {
  const { entityId } = useEntity();
  const [file, setFile] = useState<File | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DetectResult | null>(null);
  const [selectedType, setSelectedType] = useState<DetectedDocumentType | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const reset = useCallback(() => {
    setFile(null);
    setDetecting(false);
    setError(null);
    setResult(null);
    setSelectedType(null);
    setShowPicker(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleFileChange = useCallback(
    async (f: File | null) => {
      setFile(f);
      setError(null);
      setResult(null);
      setSelectedType(null);
      setShowPicker(false);
      if (!f || !entityId) return;

      setDetecting(true);
      try {
        const body = new FormData();
        body.append("file", f);
        const res = await apiFetch<DetectResult>(
          `/entities/${entityId}/detect-document-type`,
          { method: "POST", body },
        );
        setResult(res);
        setSelectedType(res.document_type);
        if (res.confidence === "low") {
          setShowPicker(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Detection failed");
      } finally {
        setDetecting(false);
      }
    },
    [entityId],
  );

  const handleConfirm = useCallback(() => {
    if (!file || !selectedType) return;
    handleClose();
    onConfirm(selectedType, file);
  }, [file, selectedType, handleClose, onConfirm]);

  return (
    <Dialog open={open} title="Add document" onClose={handleClose}>
      <RecordingForBanner />
      <div className="space-y-4">
        <div>
          <FileUpload
            id="add-document-file"
            file={file}
            acceptHint="PDF, XML, CSV, Excel, or image"
            onFileChange={handleFileChange}
          />
        </div>

        {detecting && (
          <p className="text-sm text-muted-foreground">Detecting file type…</p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && !showPicker && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-sm">
              We read this as{" "}
              <span className="font-semibold">
                {DOCUMENT_TYPE_LABELS[selectedType ?? result.document_type]}
              </span>
            </p>
            <div className="mt-3 flex gap-2">
              <Button type="button" onClick={handleConfirm}>
                <Upload className="mr-1.5 size-4" />
                Confirm
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowPicker(true)}
              >
                Change type
              </Button>
            </div>
          </div>
        )}

        {showPicker && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Select the document type:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ALL_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setSelectedType(type);
                    setShowPicker(false);
                  }}
                  className={
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors " +
                    (selectedType === type
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border hover:bg-muted/50")
                  }
                >
                  {DOCUMENT_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
