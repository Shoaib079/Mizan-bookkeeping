"use client";

/** State + preview/session/submit logic for StatementImportPanel (file-size split). */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { apiErrorMessage } from "@/lib/api-error-message";
import type { BankStatementPreview } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import {
  applyColumnAssignment,
  DEFAULT_MAPPING,
  sanitizeStatementMapping,
  statementImportSessionKey,
  type ColumnAssignRole,
  type MappingState,
} from "@/lib/statement-import-helpers";
import {
  takeStatementImportFileHandoff,
  takeStatementImportPreviewResult,
} from "@/lib/statement-import-handoff";
import { fetchStatementPreviewResult } from "@/lib/statement-import-preview-fetch";
import {
  getInflightStatementPreview,
  statementPreviewInflightKey,
  trackInflightStatementPreview,
  type StatementPreviewLoadResult,
} from "@/lib/statement-import-preview-inflight";
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
  statementImportSuccessToast,
  submitStatementImport,
} from "@/lib/statement-import-submit";
import { useToast } from "@/lib/toast";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";

export function useStatementImport(moneyAccountId: string) {
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

  /** Memoised above the resume effect so that effect can list it as a dep
   * (avoids TDZ / exhaustive-deps hole). entityId + moneyAccountId feed
   * storageKey, which the effect already depends on. */
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
      const idempotencyKey = submitIdempotency.beginSubmit();
      const statement = await submitStatementImport({
        entityId,
        moneyAccountId,
        file,
        mapping,
        idempotencyKey,
      });
      submitIdempotency.completeSubmit();
      if (storageKey) clearStatementImportSession(storageKey);
      toast(statementImportSuccessToast(statement));
      router.push(`/banking/statements/${statement.id}`);
    } catch (err) {
      const message = apiErrorMessage(err, "Upload failed");
      setError(message);
      toast(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  function backToPick() {
    if (storageKey) clearStatementImportSession(storageKey);
    setStep("pick");
    setFile(null);
    setPreview(null);
    setAssignTarget(null);
    setExpectedFileName(null);
  }

  return {
    entityId, file, setFile, preview, mapping, setMapping, step, error,
    loadingPreview, submitting, autoDetected, detectedClosingBalance,
    assignTarget, setAssignTarget, expectedFileName, storageKey, maxCol,
    loadPreview, handleAssignColumn, onSubmit, backToPick,
  };
}
