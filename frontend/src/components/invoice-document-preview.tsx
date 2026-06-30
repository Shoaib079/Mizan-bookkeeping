"use client";

/** Inline preview of uploaded e-Fatura PDF/XML — auth via blob download. */

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiDownload } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";

type Props = {
  draftId: string;
  /** pdf | xml — when unknown, infer from blob type */
  sourceType?: "efatura_pdf" | "efatura_xml";
  compact?: boolean;
  className?: string;
};

export function InvoiceDocumentPreview({
  draftId,
  sourceType = "efatura_pdf",
  compact = false,
  className,
}: Props) {
  const { entityId } = useEntity();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const { blob } = await apiDownload(
        `/entities/${entityId}/invoices/drafts/${draftId}/document`,
      );
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document unavailable");
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } finally {
      setLoading(false);
    }
  }, [entityId, draftId]);

  useEffect(() => {
    void load();
    return () => {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [load]);

  if (!entityId) return null;

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground">Loading document…</p>
    );
  }

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>;
  }

  if (!blobUrl) return null;

  const isPdf = sourceType === "efatura_pdf";

  if (compact) {
    return (
      <Button
        type="button"
        variant="secondary"
        className={`h-8 px-2 text-xs ${className ?? ""}`}
        onClick={() => window.open(blobUrl, "_blank", "noopener,noreferrer")}
      >
        View invoice
      </Button>
    );
  }

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Uploaded invoice</h3>
        <Button
          type="button"
          variant="secondary"
          className="h-8 px-2 text-xs"
          onClick={() => window.open(blobUrl, "_blank", "noopener,noreferrer")}
        >
          Open in new tab
        </Button>
      </div>
      {isPdf ? (
        <iframe
          title="Invoice PDF preview"
          src={blobUrl}
          className="h-[min(480px,70vh)] w-full rounded-md border border-border bg-muted/30"
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          XML invoice —{" "}
          <a
            href={blobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            open file
          </a>
        </p>
      )}
    </div>
  );
}
