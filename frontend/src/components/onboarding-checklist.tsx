"use client";

/** Dashboard first-run setup checklist — Phase 12 Slice 12.0. */

import { Check, Circle, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import {
  buildOnboardingSteps,
  deriveOnboardingState,
  isOnboardingComplete,
  readOnboardingDismissed,
  shouldShowOnboardingChecklist,
  writeOnboardingDismissed,
  type PaginatedTotal,
} from "@/lib/onboarding";
import { useEntity } from "@/lib/entity-context";
import { useEntityAccess } from "@/lib/use-entity-access";
import { cn } from "@/lib/utils";

export function OnboardingChecklist() {
  const { entityId } = useEntity();
  const { role } = useEntityAccess();
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<ReturnType<typeof deriveOnboardingState> | null>(
    null,
  );

  const reload = useCallback(async () => {
    if (!entityId) {
      setState(null);
      return;
    }
    setLoading(true);
    try {
      const [openingBalance, members, dailySummaries] = await Promise.all([
        apiFetch<PaginatedTotal>(
          `/entities/${entityId}/ledger/entries?source=opening_balance&limit=1`,
        ),
        apiFetch<PaginatedTotal>(`/entities/${entityId}/members?limit=2`),
        apiFetch<PaginatedTotal>(
          `/entities/${entityId}/pos/daily-summaries?limit=1`,
        ),
      ]);
      setState(
        deriveOnboardingState({ openingBalance, members, dailySummaries }),
      );
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    if (!entityId) {
      setDismissed(false);
      setState(null);
      return;
    }
    setDismissed(readOnboardingDismissed(entityId));
    void reload();
  }, [entityId, reload]);

  const steps = useMemo(() => {
    if (!state) return [];
    return buildOnboardingSteps(state, role);
  }, [state, role]);

  const complete = isOnboardingComplete(steps);
  const visible =
    Boolean(entityId) &&
    shouldShowOnboardingChecklist(role) &&
    !loading &&
    state !== null &&
    !complete &&
    !dismissed;

  if (!visible) return null;

  const doneCount = steps.filter((step) => step.done).length;

  return (
    <section
      className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4"
      aria-label="Setup checklist"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Get your books ready</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {doneCount} of {steps.length} steps complete — finish setup before your
            first trading day.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="size-8 shrink-0 p-0 text-muted-foreground"
          aria-label="Dismiss setup checklist"
          onClick={() => {
            if (!entityId) return;
            writeOnboardingDismissed(entityId);
            setDismissed(true);
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map((step) => (
          <li key={step.id}>
            {step.done ? (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="line-through">{step.label}</span>
              </span>
            ) : (
              <Link
                href={step.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-1 py-0.5 text-sm text-primary hover:underline",
                )}
              >
                <Circle className="size-4 shrink-0" aria-hidden />
                {step.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
