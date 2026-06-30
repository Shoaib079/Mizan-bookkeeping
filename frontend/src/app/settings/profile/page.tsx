"use client";

import { FormEvent, useEffect, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useApiAuth } from "@/lib/api-auth";
import { useEntity } from "@/lib/entity-context";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export default function ProfileSettingsPage() {
  const { clerkEnabled } = useApiAuth();
  const { userProfile, refreshUserProfile } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(userProfile?.display_name?.trim() ?? "");
  }, [userProfile?.display_name]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!displayName.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch("/users/me", {
        method: "PATCH",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });
      submitIdempotency.completeSubmit();
      await refreshUserProfile();
      toast("Profile saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Your profile">
      <div className="max-w-md">
        {clerkEnabled && userProfile?.email && (
          <p className="mb-4 text-sm text-muted-foreground">{userProfile.email}</p>
        )}
        <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
          <div>
            <Label htmlFor="profile-display-name">Display name</Label>
            <Input
              id="profile-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={saving}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={saving || !displayName.trim()}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
