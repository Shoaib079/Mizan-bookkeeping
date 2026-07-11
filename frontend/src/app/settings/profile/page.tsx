"use client";

/** Your profile — identity, restaurants & role, appearance (IA v2). */

import Link from "next/link";
import { Check, Moon, Sun } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { useTheme } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useApiAuth } from "@/lib/api-auth";
import { useEntity } from "@/lib/entity-context";
import { entityAccentColor, entityInitial } from "@/lib/entity-visual";
import { ENTITY_ROLES } from "@/lib/settings-types";
import { useEntityAccess } from "@/lib/use-entity-access";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

function roleLabel(role: string): string {
  return ENTITY_ROLES.find((r) => r.value === role)?.label ?? role;
}

function initialsFor(name: string, email: string | undefined): string {
  const source = name.trim() || email || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function ProfileSettingsPage() {
  const { clerkEnabled } = useApiAuth();
  const { userProfile, refreshUserProfile, entities, entityId, setEntityId } =
    useEntity();
  const { role } = useEntityAccess();
  const { dark, mounted, setDarkMode } = useTheme();
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
      <div className="max-w-xl space-y-6">
        {/* Identity */}
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-4">
            <span
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary"
              aria-hidden
            >
              {initialsFor(displayName, userProfile?.email)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">
                {displayName.trim() || "Unnamed user"}
              </p>
              {userProfile?.email && (
                <p className="truncate text-sm text-muted-foreground">
                  {userProfile.email}
                </p>
              )}
              {!clerkEnabled && (
                <p className="text-xs text-muted-foreground">
                  Dev mode — sign-in is disabled
                </p>
              )}
            </div>
          </div>

          <form
            className="mt-5 space-y-3 border-t border-border pt-4"
            onSubmit={(event) => void onSubmit(event)}
          >
            <div>
              <Label htmlFor="profile-display-name">Display name</Label>
              <Input
                id="profile-display-name"
                className="mt-1"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={saving}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Shown on entries you post and in the audit trail.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={saving || !displayName.trim()}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </section>

        {/* Restaurants & role */}
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Your restaurants</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Click a restaurant to switch to it.
          </p>
          {entities.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              You&apos;re not a member of any restaurant yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {entities.map((entity) => {
                const active = entity.id === entityId;
                return (
                  <li key={entity.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted/50",
                        active && "font-medium",
                      )}
                      onClick={() => {
                        if (!active) {
                          setEntityId(entity.id, { redirectToDashboard: true });
                        }
                      }}
                    >
                      <span
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: entityAccentColor(entity.id) }}
                        aria-hidden
                      >
                        {entityInitial(entity.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{entity.name}</span>
                      {active && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          <Check className="size-3" />
                          {role ? roleLabel(role) : "Current"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Roles and members are managed in{" "}
            <Link
              href="/settings/restaurant"
              className="text-primary hover:underline"
            >
              Restaurant settings
            </Link>
            .
          </p>
        </section>

        {/* Appearance */}
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Appearance</h2>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant={mounted && !dark ? "primary" : "secondary"}
              className="gap-2"
              onClick={() => setDarkMode(false)}
            >
              <Sun className="size-4" /> Light
            </Button>
            <Button
              type="button"
              variant={mounted && dark ? "primary" : "secondary"}
              className="gap-2"
              onClick={() => setDarkMode(true)}
            >
              <Moon className="size-4" /> Dark
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
