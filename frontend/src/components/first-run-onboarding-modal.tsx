"use client";

/** First-run onboarding — name + first restaurant when user has no companies. */

import { FormEvent, useEffect, useState } from "react";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api";
import { useApiAuth } from "@/lib/api-auth";
import { useEntity } from "@/lib/entity-context";
import {
  shouldShowFirstRunOnboarding,
  submitFirstRunOnboarding,
} from "@/lib/first-run-onboarding";
import { vknValidationMessage } from "@/lib/vkn";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";

export function FirstRunOnboardingModal() {
  const { clerkEnabled, isAuthReady } = useApiAuth();
  const {
    entities,
    entitiesLoading,
    entitiesLoaded,
    entitiesError,
    refreshEntities,
    setEntityId,
    userProfile,
    refreshUserProfile,
  } = useEntity();
  const submitIdempotency = useSubmitIdempotency();

  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [vkn, setVkn] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = shouldShowFirstRunOnboarding({
    isAuthReady,
    entitiesLoading,
    entitiesLoaded,
    entitiesError,
    entityCount: entities.length,
  });

  useEffect(() => {
    if (!open) return;
    if (userProfile?.display_name?.trim()) {
      setFullName(userProfile.display_name.trim());
    }
  }, [open, userProfile?.display_name]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!fullName.trim() || !businessName.trim() || submitting) return;
    const vknError = vknValidationMessage(vkn);
    if (vknError) {
      setError(vknError);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await submitFirstRunOnboarding(
        { fullName, businessName, legalName, vkn },
        {
          clerkEnabled,
          patchDisplayName: async (name) => {
            const idempotencyKey = submitIdempotency.beginSubmit();
            await apiFetch("/users/me", {
              method: "PATCH",
              idempotencyKey,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ display_name: name }),
            });
            submitIdempotency.completeSubmit();
            await refreshUserProfile();
          },
          createEntity: async (payload) => {
            const idempotencyKey = submitIdempotency.beginSubmit();
            const entity = await apiFetch<{ id: string }>("/entities", {
              method: "POST",
              idempotencyKey,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            submitIdempotency.completeSubmit();
            return entity;
          },
          refreshEntities,
          setEntityId,
        },
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(err.message);
      } else if (err instanceof ApiError && err.status === 401) {
        setError("Sign in is required to create your restaurant.");
      } else {
        setError(err instanceof Error ? err.message : "Setup failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <Dialog open title="Welcome to Mizan" onClose={() => undefined}>
      <p className="text-sm text-muted-foreground">
        Tell us your name and your first restaurant to start bookkeeping.
      </p>
      <form className="mt-4 space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <div>
          <Label htmlFor="first-run-full-name">Full name</Label>
          <Input
            id="first-run-full-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Your name"
            required
            disabled={submitting}
          />
        </div>
        <div>
          <Label htmlFor="first-run-business-name">Business display name</Label>
          <Input
            id="first-run-business-name"
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
            placeholder="e.g. Kadıköy branch"
            required
            disabled={submitting}
          />
        </div>
        <div>
          <Label htmlFor="first-run-vkn">Vergi numarası (VKN)</Label>
          <Input
            id="first-run-vkn"
            value={vkn}
            onChange={(event) => setVkn(event.target.value)}
            placeholder="10–11 digits"
            inputMode="numeric"
            required
            disabled={submitting}
          />
        </div>
        <div>
          <Label htmlFor="first-run-legal-name">Legal name (optional)</Label>
          <Input
            id="first-run-legal-name"
            value={legalName}
            onChange={(event) => setLegalName(event.target.value)}
            placeholder="Registered company name"
            disabled={submitting}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="submit"
          className="w-full"
          disabled={
            submitting ||
            !fullName.trim() ||
            !businessName.trim() ||
            !!vknValidationMessage(vkn)
          }
        >
          {submitting ? "Setting up…" : "Continue to dashboard"}
        </Button>
      </form>
    </Dialog>
  );
}
