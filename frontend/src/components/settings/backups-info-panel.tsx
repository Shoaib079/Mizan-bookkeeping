"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ForbiddenMessage } from "@/components/reports/forbidden-message";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

type EnqueueResult = {
  status: "started";
  task_id: string;
};

type TaskStatus = {
  status: "pending" | "success" | "failed";
  task_id: string;
  artifact_key?: string | null;
  timestamp?: string | null;
  message?: string | null;
};

const POLL_MS = 2000;
const MAX_POLL_MS = 15 * 60 * 1000;

export function BackupsInfoPanel() {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const [forbidden, setForbidden] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastArtifact, setLastArtifact] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  async function pollUntilDone(taskId: string, startedAt: number) {
    if (!entityId) return;
    try {
      const status = await apiFetch<TaskStatus>(
        `/entities/${entityId}/backups/run/${taskId}`,
      );
      if (status.status === "pending") {
        if (Date.now() - startedAt > MAX_POLL_MS) {
          setRunning(false);
          setError(
            "Backup is still running on the server. Check Cloudflare R2 in a few minutes.",
          );
          return;
        }
        pollTimer.current = setTimeout(
          () => void pollUntilDone(taskId, startedAt),
          POLL_MS,
        );
        return;
      }
      setRunning(false);
      if (status.status === "success") {
        const key = status.artifact_key ?? "backup";
        setLastArtifact(key);
        setError(null);
        toast(`Backup uploaded: ${key}`);
        return;
      }
      setError(status.message ?? "Backup failed");
    } catch (err) {
      setRunning(false);
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not check backup status");
    }
  }

  async function onBackupNow() {
    if (!entityId || running) return;
    clearPoll();
    setRunning(true);
    setError(null);
    setForbidden(false);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const enqueued = await apiFetch<EnqueueResult>(
        `/entities/${entityId}/backups/run`,
        { method: "POST", idempotencyKey },
      );
      submitIdempotency.completeSubmit();
      toast("Backup started — uploading to Cloudflare…");
      void pollUntilDone(enqueued.task_id, Date.now());
    } catch (err) {
      setRunning(false);
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not start backup");
    }
  }

  if (forbidden) {
    return (
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Backups</h2>
        <div className="mt-3">
          <ForbiddenMessage detail="Only restaurant owners and admins can run a manual backup." />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">Backups</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Nightly backups upload automatically to Cloudflare R2. Use{" "}
        <strong>Backup now</strong> to upload immediately — if you already
        backed up today (UTC), that night&apos;s automatic run is skipped.
      </p>
      <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
        <li>Storage: Cloudflare R2 (same place as the daily job)</li>
        <li>Retention: daily + weekly archives per server settings</li>
        <li>Restore: operator workflow only — no restore button in the app</li>
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => void onBackupNow()}
          disabled={!entityId || running}
        >
          {running ? "Backing up…" : "Backup now"}
        </Button>
        {lastArtifact && (
          <span className="text-xs text-muted-foreground tabular-nums">
            Last manual: {lastArtifact}
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
