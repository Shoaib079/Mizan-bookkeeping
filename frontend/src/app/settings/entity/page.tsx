"use client";

/** Restaurant create + entity settings — Phase 9 Slice 9; Phase 11.2 editable toggles. */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import {
  KNOWN_ENTITY_SETTINGS,
  type EntitySettingRow,
} from "@/lib/settings-types";
import { useToast } from "@/lib/toast";

type WizardDraft = Record<string, boolean>;

function defaultWizardDraft(): WizardDraft {
  return Object.fromEntries(
    KNOWN_ENTITY_SETTINGS.map((def) => [def.key, false]),
  );
}

export default function EntitySettingsPage() {
  const { entityId, setEntityId, refreshEntities } = useEntity();
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [settings, setSettings] = useState<EntitySettingRow[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [chartCount, setChartCount] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [wizardEntityId, setWizardEntityId] = useState<string | null>(null);
  const [wizardDraft, setWizardDraft] = useState<WizardDraft>(defaultWizardDraft);
  const [wizardSaving, setWizardSaving] = useState(false);

  const activeEntityId = wizardEntityId ?? entityId;
  const inSetupWizard = wizardEntityId !== null;

  const reloadSettings = useCallback(async () => {
    if (!activeEntityId) {
      setSettings([]);
      setChartCount(null);
      return;
    }
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const [settingsRes, chartRes] = await Promise.all([
        apiFetch<{ items: EntitySettingRow[] }>(
          `/entities/${activeEntityId}/settings?limit=200`,
        ),
        apiFetch<{ total: number }>(
          `/entities/${activeEntityId}/chart-of-accounts?limit=1`,
        ),
      ]);
      setSettings(settingsRes.items);
      setChartCount(chartRes.total);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Failed to load");
      setSettings([]);
      setChartCount(null);
    } finally {
      setSettingsLoading(false);
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
      await apiFetch(`/entities/${targetEntityId}/settings/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
    } else {
      await apiFetch(`/entities/${targetEntityId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
    }
  }

  async function onCreateRestaurant(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const entity = await apiFetch<{ id: string; name: string }>("/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      await refreshEntities();
      setEntityId(entity.id);
      setNewName("");
      setWizardEntityId(entity.id);
      setWizardDraft(defaultWizardDraft());
      toast("Restaurant created");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setCreateError("Sign in is required to create a restaurant.");
      } else {
        setCreateError(err instanceof Error ? err.message : "Create failed");
      }
    } finally {
      setCreating(false);
    }
  }

  async function onSeedChart() {
    if (!entityId) return;
    setSeeding(true);
    setSettingsError(null);
    try {
      await apiFetch(`/entities/${entityId}/chart-of-accounts/seed`, {
        method: "POST",
      });
      await reloadSettings();
      toast("Chart seeded");
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  }

  function settingValue(key: string): boolean {
    const row = settings.find((s) => s.key === key);
    return row !== undefined && row.value.trim().toLowerCase() === "true";
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
      <AppShell title="Set up restaurant">
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
      </AppShell>
    );
  }

  return (
    <AppShell title="Restaurant & toggles">
      <div className="max-w-xl space-y-8">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Create restaurant</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Adds a new legal entity. Switch restaurants anytime from the
            sidebar.
          </p>
          <form className="mt-4 space-y-3" onSubmit={onCreateRestaurant}>
            <div>
              <Label htmlFor="entity-name">Name</Label>
              <Input
                id="entity-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Kadıköy branch"
              />
            </div>
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
            <Button type="submit" disabled={creating || !newName.trim()}>
              {creating ? "Creating…" : "Create restaurant"}
            </Button>
          </form>
        </section>

        {entityId && (
          <>
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Chart of accounts</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {chartCount === null
                  ? "Loading…"
                  : chartCount > 0
                    ? `${chartCount} account${chartCount === 1 ? "" : "s"} seeded.`
                    : "No chart yet — seed before opening balances."}
              </p>
              {chartCount === 0 && (
                <Button
                  type="button"
                  className="mt-3"
                  disabled={seeding}
                  onClick={() => void onSeedChart()}
                >
                  {seeding ? "Seeding…" : "Seed default chart"}
                </Button>
              )}
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
    </AppShell>
  );
}
