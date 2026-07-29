"use client";

/** Month close — check the month is sound, then seal it.
 *
 * Closing is a soft lock: staff can no longer post into the month at all, and
 * the owner can, but must say why. The reason is logged and the month is
 * flagged as changed, so a sealed month never quietly drifts.
 */

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Lock, LockOpen, X } from "lucide-react";

import {
  ForbiddenMessage,
  isForbiddenError,
} from "@/components/reports/forbidden-message";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import { useEntityAccess } from "@/lib/use-entity-access";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  closableMonths,
  closeState,
  failedChecks,
  monthLabel,
  parseMonthValue,
  passedChecks,
  readinessSummary,
} from "@/lib/month-close";
import { YearEndClose } from "@/components/reports/year-end-close";
import type {
  MonthCloseReadinessRead,
  PeriodLockRead,
  ReadinessCheck,
} from "@/lib/report-types";
import { cn } from "@/lib/utils";

function CheckRow({ check }: { check: ReadinessCheck }) {
  const blocking = check.severity === "block" && !check.passed;
  return (
    <li className="flex items-start gap-3 border-b border-border py-2.5 last:border-0">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          check.passed && "bg-success/10 text-success",
          blocking && "bg-destructive/10 text-destructive",
          !check.passed && !blocking && "bg-warning/10 text-warning",
        )}
      >
        {check.passed ? (
          <Check className="h-3 w-3" />
        ) : blocking ? (
          <X className="h-3 w-3" />
        ) : (
          <AlertTriangle className="h-3 w-3" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium">{check.label}</span>
          {check.amount_kurus !== null && (
            <span className="text-sm tabular-nums text-muted-foreground">
              {formatTry(check.amount_kurus)}
            </span>
          )}
        </div>
        {check.detail && (
          <p className="mt-0.5 text-xs text-muted-foreground">{check.detail}</p>
        )}
      </div>
      {!check.passed && check.href && (
        <Link
          href={check.href}
          className="shrink-0 text-xs text-primary hover:underline"
        >
          Fix →
        </Link>
      )}
    </li>
  );
}

function MonthCloseContent() {
  const { entityId } = useEntity();
  const { role } = useEntityAccess();
  const { toast } = useToast();
  const isOwner = role === "owner";

  const months = useMemo(() => closableMonths(new Date()), []);
  const [monthKey, setMonthKey] = useState(months[0]?.value ?? "");
  const [readiness, setReadiness] = useState<MonthCloseReadinessRead | null>(null);
  const [locks, setLocks] = useState<PeriodLockRead[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const reload = useCallback(async () => {
    const parsed = parseMonthValue(monthKey);
    if (!entityId || !parsed) {
      setReadiness(null);
      return;
    }
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const [readinessRes, locksRes] = await Promise.all([
        apiFetch<MonthCloseReadinessRead>(
          `/entities/${entityId}/period-locks/readiness?year=${parsed.year}&month=${parsed.month}`,
        ),
        apiFetch<{ items: PeriodLockRead[] }>(
          `/entities/${entityId}/period-locks`,
        ).catch(() => ({ items: [] as PeriodLockRead[] })),
      ]);
      setReadiness(readinessRes);
      setLocks(locksRes.items.filter((l) => l.lock_kind === "month"));
    } catch (err) {
      if (isForbiddenError(err)) {
        setForbidden(true);
        setReadiness(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load");
        setReadiness(null);
      }
    } finally {
      setLoading(false);
    }
  }, [entityId, monthKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleClose() {
    const parsed = parseMonthValue(monthKey);
    if (!entityId || !parsed || !readiness) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/entities/${entityId}/period-locks/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lock_kind: "month",
          anchor_date: readiness.period_end,
          reason: note.trim() || null,
        }),
      });
      setNote("");
      toast(`${monthLabel(parsed.year, parsed.month)} closed`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close the month");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReopen(lockId: string) {
    if (!entityId) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/entities/${entityId}/period-locks/${lockId}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: note.trim() || null }),
      });
      setNote("");
      toast("Month reopened");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reopen");
    } finally {
      setSubmitting(false);
    }
  }

  const state = readiness ? closeState(readiness) : null;
  const failed = readiness ? failedChecks(readiness) : [];
  const passed = readiness ? passedChecks(readiness) : [];
  const closedMonths = useMemo(
    () =>
      [...locks]
        .filter((l) => l.reopened_at === null)
        .sort((a, b) => b.period_start.localeCompare(a.period_start)),
    [locks],
  );

  return (
    <AppShell title="Month close">
      <p className="mb-4 text-sm text-muted-foreground">
        Seal a month once you&apos;re happy with it. Your staff can no longer
        post into it; you still can, but you&apos;ll be asked why — and the
        month gets flagged so you know it changed.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Combobox
          id="month-close-month"
          className="w-48"
          value={monthKey}
          onValueChange={setMonthKey}
          options={months.map((m) => ({ value: m.value, label: m.label }))}
          placeholder="Month…"
        />
      </div>

      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}
      {forbidden && <ForbiddenMessage />}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <PageSkeleton />}

      {readiness && state && !loading && (
        <div className="space-y-6">
          <section
            className={cn(
              "rounded-lg border p-4",
              state.kind === "closed" && !state.dirty
                ? "border-success/40 bg-success/5"
                : state.kind === "closed"
                  ? "border-warning/40 bg-warning/5"
                  : state.canClose
                    ? "border-border bg-card"
                    : "border-destructive/40 bg-destructive/5",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {state.kind === "closed" ? (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <LockOpen className="h-4 w-4 text-muted-foreground" />
                  )}
                  <h2 className="text-base font-semibold">
                    {monthLabel(readiness.year, readiness.month)}
                  </h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {readinessSummary(readiness)}
                </p>
                {state.kind === "closed" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Closed {formatTrDate(state.lock.closed_at.slice(0, 10))}
                  </p>
                )}
              </div>

              {isOwner && (
                <div className="shrink-0">
                  {state.kind === "closed" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={submitting}
                      onClick={() => void handleReopen(state.lock.id)}
                    >
                      {submitting ? "Reopening…" : "Reopen month"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      disabled={submitting || !state.canClose}
                      onClick={() => void handleClose()}
                    >
                      {submitting ? "Closing…" : "Close month"}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {isOwner && (
              <div className="mt-3">
                <Label htmlFor="month-close-note">Note (optional)</Label>
                <Input
                  id="month-close-note"
                  className="mt-1 max-w-md"
                  placeholder="Reviewed with accountant"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            )}
            {!isOwner && (
              <p className="mt-3 text-xs text-muted-foreground">
                Only the owner can close or reopen a month.
              </p>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">
              {failed.length > 0 ? "Needs your attention" : "All checks passed"}
            </h2>
            {failed.length > 0 && (
              <ul className="rounded-lg border border-border bg-card px-4">
                {failed.map((check) => (
                  <CheckRow key={check.key} check={check} />
                ))}
              </ul>
            )}
            {passed.length > 0 && (
              <ul
                className={cn(
                  "rounded-lg border border-border bg-card px-4",
                  failed.length > 0 && "mt-3",
                )}
              >
                {passed.map((check) => (
                  <CheckRow key={check.key} check={check} />
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Only unclassified bank lines stop a close — those are real
              transactions missing from your books. The rest are for your eye.
            </p>
          </section>

          {entityId && <YearEndClose entityId={entityId} isOwner={isOwner} />}

          {closedMonths.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Closed months</h2>
              <ul className="rounded-lg border border-border bg-card px-4">
                {closedMonths.map((lock) => {
                  const [y, m] = lock.period_start.split("-");
                  return (
                    <li
                      key={lock.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2.5 last:border-0"
                    >
                      <span className="text-sm">
                        {monthLabel(Number(y), Number(m))}
                      </span>
                      <div className="flex items-center gap-3">
                        {lock.dirty && (
                          <span className="rounded-md bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                            Changed since close
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatTrDate(lock.closed_at.slice(0, 10))}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}

export default function MonthClosePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MonthCloseContent />
    </Suspense>
  );
}
