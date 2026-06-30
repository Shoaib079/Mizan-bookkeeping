"use client";

/** Restaurant create + entity settings — Phase 9 Slice 9; Phase 11.2 editable toggles. */

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useEntity } from "@/lib/entity-context";
import {
  KNOWN_ENTITY_SETTINGS,
  type EntitySettingRow,
} from "@/lib/settings-types";
import { normalizeVknInput, vknValidationMessage } from "@/lib/vkn";
import { useToast } from "@/lib/toast";

type EntityProfile = {
  id: string;
  name: string;
  legal_name: string | null;
  vkn: string | null;
};

type WizardDraft = Record<string, boolean>;

function defaultWizardDraft(): WizardDraft {
  return Object.fromEntries(
    KNOWN_ENTITY_SETTINGS.map((def) => [def.key, false]),
  );
}

export default function EntitySettingsPage() {
  const router = useRouter();
  const { entityId, setEntityId, refreshEntities } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const [newName, setNewName] = useState("");
  const [newLegalName, setNewLegalName] = useState("");
  const [newVkn, setNewVkn] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [profile, setProfile] = useState<EntityProfile | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileLegalName, setProfileLegalName] = useState("");
  const [profileVkn, setProfileVkn] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [settings, setSettings] = useState<EntitySettingRow[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [chartCount, setChartCount] = useState<number | null>(null);
  const [wizardEntityId, setWizardEntityId] = useState<string | null>(null);
  const [wizardDraft, setWizardDraft] = useState<WizardDraft>(defaultWizardDraft);
  const [wizardSaving, setWizardSaving] = useState(false);

  const activeEntityId = wizardEntityId ?? entityId;
  const inSetupWizard = wizardEntityId !== null;

  const reloadSettings = useCallback(async () => {
    if (!activeEntityId) {
      setSettings([]);
      setChartCount(null);
      setProfile(null);
      return;
    }
    setSettingsLoading(true);
    setSettingsError(null);
    setProfileLoading(true);
    setProfileError(null);
    try {
      const [settingsRes, chartRes, entityRes] = await Promise.all([
        apiFetch<{ items: EntitySettingRow[] }>(
          `/entities/${activeEntityId}/settings?limit=200`,
        ),
        apiFetch<{ total: number }>(
          `/entities/${activeEntityId}/chart-of-accounts?limit=1`,
        ),
        apiFetch<EntityProfile>(`/entities/${activeEntityId}`),
      ]);
      setSettings(settingsRes.items);
      setChartCount(chartRes.total);
      setProfile(entityRes);
      setProfileName(entityRes.name);
      setProfileLegalName(entityRes.legal_name ?? "");
      setProfileVkn(entityRes.vkn ?? "");
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Failed to load");
      setSettings([]);
      setChartCount(null);
      setProfile(null);
      setProfileError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setSettingsLoading(false);
      setProfileLoading(false);
    }
  }, [activeEntityId]);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  useEffect(() => {
    if (!inSetupWizard) {
      window.setTimeout(() => document.getElementById("entity-name")?.focus(), 0);
    }
  }, [inSetupWizard]);

  async function saveSetting(
    targetEntityId: string,
    key: string,
    enabled: boolean,
    existingKeys: Set<string>,
  ) {
    const value = enabled ? "true" : "false";
    if (existingKeys.has(key)) {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(`/entities/${targetEntityId}/settings/${key}`, {
        method: "PATCH",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
    } else {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(`/entities/${targetEntityId}/settings`, {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
    }
    submitIdempotency.completeSubmit();
  }

  async function onCreateRestaurant(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    const vknError = vknValidationMessage(newVkn);
    if (vknError) {
      setCreateError(vknError);
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const body: { name: string; vkn: string; legal_name?: string } = {
        name: newName.trim(),
        vkn: normalizeVknInput(newVkn),
      };
      const legal = newLegalName.trim();
      if (legal) body.legal_name = legal;
      const entity = await apiFetch<{ id: string; name: string }>("/entities", {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      submitIdempotency.completeSubmit();
      await refreshEntities();
      setEntityId(entity.id);
      setNewName("");
      setNewLegalName("");
      setNewVkn("");
      setWizardEntityId(entity.id);
      setWizardDraft(defaultWizardDraft());
      toast("Restaurant created");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setCreateError(err.message);
      } else if (err instanceof ApiError && err.status === 401) {
        setCreateError("Sign in is required to create a restaurant.");
      } else {
        setCreateError(err instanceof Error ? err.message : "Create failed");
      }
    } finally {
      setCreating(false);
    }
  }

  function settingValue(key: string): boolean {
    const row = settings.find((s) => s.key === key);
    return row !== undefined && row.value.trim().toLowerCase() === "true";
  }

  async function onSaveCompanyProfile(event: FormEvent) {
    event.preventDefault();
    if (!entityId || inSetupWizard) return;
    const vknError = vknValidationMessage(profileVkn);
    if (vknError) {
      setProfileError(vknError);
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const updated = await apiFetch<EntityProfile>(`/entities/${entityId}`, {
        method: "PATCH",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileName.trim(),
          legal_name: profileLegalName.trim(),
          vkn: normalizeVknInput(profileVkn),
        }),
      });
      submitIdempotency.completeSubmit();
      setProfile(updated);
      await refreshEntities();
      toast("Company profile saved");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setProfileSaving(false);
    }
  }

  async function onToggleSetting(key: string, enabled: boolean) {
    if (!entityId || inSetupWizard) return;
    setSavingKey(key);
    setSettingsError(null);
    try {
      const existingKeys = new Set(settings.map((s) => s.key));
      await saveSetting(entityId, key, enabled, existingKeys);
      await reloadSettings();
      const label =
        KNOWN_ENTITY_SETTINGS.find((s) => s.key === key)?.label ?? key;
      toast(`${label} saved`);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingKey(null);
    }
  }

  async function onWizardContinue() {
    if (!wizardEntityId) return;
    setWizardSaving(true);
    setSettingsError(null);
    try {
      const existingKeys = new Set(settings.map((s) => s.key));
      for (const def of KNOWN_ENTITY_SETTINGS) {
        const enabled = wizardDraft[def.key] ?? false;
        if (enabled || existingKeys.has(def.key)) {
          await saveSetting(
            wizardEntityId,
            def.key,
            enabled,
            existingKeys,
          );
          existingKeys.add(def.key);
        }
      }
      setWizardEntityId(null);
      await reloadSettings();
      toast("Feature toggles saved");
      router.push("/");
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setWizardSaving(false);
    }
  }

  function renderToggleList(
    checkedFor: (key: string) => boolean,
    onChange: (key: string, enabled: boolean) => void,
    disabled: boolean,
  ) {
    return (
      <ul className="mt-4 space-y-4">
        {KNOWN_ENTITY_SETTINGS.map((def) => {
          const checked = checkedFor(def.key);
          const exists = settings.some((s) => s.key === def.key);
          return (
            <li
              key={def.key}
              className="flex items-start justify-between gap-4"
            >
              <div>
                <p className="text-sm font-medium">{def.label}</p>
                <p className="text-xs text-muted-foreground">
                  {def.description}
                </p>
                {!inSetupWizard && (
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {def.key}
                    {exists ? ` = ${checked ? "true" : "false"}` : " (not set)"}
                  </p>
                )}
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || savingKey === def.key}
                  onChange={(e) => onChange(def.key, e.target.checked)}
                />
                {savingKey === def.key ? "Saving…" : checked ? "On" : "Off"}
              </label>
            </li>
          );
        })}
      </ul>
    );
  }

  if (inSetupWizard) {
    return (
      <>
        <div className="max-w-xl space-y-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Step 2 of 2
            </p>
            <h2 className="mt-1 text-sm font-semibold">Feature toggles</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose which modules this restaurant needs. You can change these
              when your needs change. Leave off anything you do not need yet.
            </p>
            {settingsError && (
              <p className="mt-3 text-sm text-destructive">{settingsError}</p>
            )}
            {renderToggleList(
              (key) => wizardDraft[key] ?? false,
              (key, enabled) =>
                setWizardDraft((prev) => ({ ...prev, [key]: enabled })),
              wizardSaving,
            )}
            <Button
              type="button"
              className="mt-6"
              disabled={wizardSaving}
              onClick={() => void onWizardContinue()}
            >
              {wizardSaving ? "Saving…" : "Save & continue"}
            </Button>
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="max-w-xl space-y-8">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Create restaurant</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Adds a new legal entity. Switch restaurants anytime from the
            sidebar.
          </p>
          <form className="mt-4 space-y-3" onSubmit={onCreateRestaurant}>
            <div>
              <Label htmlFor="entity-name">Display name</Label>
              <Input
                id="entity-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Kadıköy branch"
              />
            </div>
            <div>
              <Label htmlFor="entity-create-vkn">Vergi numarası (VKN)</Label>
              <Input
                id="entity-create-vkn"
                value={newVkn}
                onChange={(e) => setNewVkn(e.target.value)}
                placeholder="10–11 digits"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label htmlFor="entity-create-legal-name">Legal name (optional)</Label>
              <Input
                id="entity-create-legal-name"
                value={newLegalName}
                onChange={(e) => setNewLegalName(e.target.value)}
                placeholder="Registered company name"
              />
            </div>
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
            <Button
              type="submit"
              disabled={
                creating ||
                !newName.trim() ||
                !!vknValidationMessage(newVkn)
              }
            >
              {creating ? "Creating…" : "Create restaurant"}
            </Button>
          </form>
        </section>

        {entityId && (
          <>
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Company profile</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your registered business details — used to identify your company
                on e-Fatura uploads (buyer vs supplier).
              </p>
              {profileLoading && !profile ? (
                <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
              ) : (
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(event) => void onSaveCompanyProfile(event)}
                >
                  <div>
                    <Label htmlFor="profile-name">Display name</Label>
                    <Input
                      id="profile-name"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      disabled={profileSaving}
                    />
                  </div>
                  <div>
                    <Label htmlFor="profile-legal-name">Legal name (optional)</Label>
                    <Input
                      id="profile-legal-name"
                      value={profileLegalName}
                      onChange={(e) => setProfileLegalName(e.target.value)}
                      placeholder="Registered company name"
                      disabled={profileSaving}
                    />
                  </div>
                  <div>
                    <Label htmlFor="profile-vkn">Vergi numarası (VKN)</Label>
                    <Input
                      id="profile-vkn"
                      value={profileVkn}
                      onChange={(e) => setProfileVkn(e.target.value)}
                      placeholder="10–11 digits"
                      inputMode="numeric"
                      disabled={profileSaving}
                    />
                  </div>
                  {profileError && (
                    <p className="text-sm text-destructive">{profileError}</p>
                  )}
                  <Button
                    type="submit"
                    disabled={
                      profileSaving ||
                      !profileName.trim() ||
                      !!vknValidationMessage(profileVkn)
                    }
                  >
                    {profileSaving ? "Saving…" : "Save company profile"}
                  </Button>
                </form>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Chart of accounts</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {chartCount === null
                  ? "Loading…"
                  : `${chartCount} account${chartCount === 1 ? "" : "s"} on chart.`}
              </p>
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Feature toggles</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Per-restaurant settings. You can change these when your needs
                change.
              </p>
              {settingsLoading && (
                <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
              )}
              {settingsError && (
                <p className="mt-3 text-sm text-destructive">{settingsError}</p>
              )}
              {renderToggleList(
                settingValue,
                (key, enabled) => void onToggleSetting(key, enabled),
                settingsLoading,
              )}
            </section>
          </>
        )}

        {!entityId && (
          <p className="text-sm text-muted-foreground">
            Select a restaurant in the sidebar to manage its chart and toggles.
          </p>
        )}
      </div>
    </>
  );
}
