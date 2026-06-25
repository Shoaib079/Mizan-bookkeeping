"use client";

/** Restaurant create + entity settings — Phase 9 Slice 9. */

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

  const reloadSettings = useCallback(async () => {
    if (!entityId) {
      setSettings([]);
      setChartCount(null);
      return;
    }
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const [settingsRes, chartRes] = await Promise.all([
        apiFetch<{ items: EntitySettingRow[] }>(
          `/entities/${entityId}/settings?limit=200`,
        ),
        apiFetch<{ total: number }>(
          `/entities/${entityId}/chart-of-accounts?limit=1`,
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
  }, [entityId]);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  useEffect(() => {
    window.setTimeout(() => document.getElementById("entity-name")?.focus(), 0);
  }, []);

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
    if (!entityId) return;
    if (settings.some((s) => s.key === key)) {
      setSettingsError(
        `“${key}” is already set for this restaurant. Settings cannot be changed after creation in v1 — contact your operator if you need a different value.`,
      );
      return;
    }
    setSavingKey(key);
    setSettingsError(null);
    try {
      await apiFetch(`/entities/${entityId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: enabled ? "true" : "false" }),
      });
      await reloadSettings();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingKey(null);
    }
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
                Per-restaurant settings (create-only — each key can be set once).
              </p>
              {settingsLoading && (
                <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
              )}
              {settingsError && (
                <p className="mt-3 text-sm text-destructive">{settingsError}</p>
              )}
              <ul className="mt-4 space-y-4">
                {KNOWN_ENTITY_SETTINGS.map((def) => {
                  const exists = settings.some((s) => s.key === def.key);
                  const checked = settingValue(def.key);
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
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {def.key}
                          {exists ? ` = ${checked ? "true" : "false"}` : " (not set)"}
                        </p>
                      </div>
                      <label className="flex shrink-0 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={exists || savingKey === def.key}
                          onChange={(e) =>
                            void onToggleSetting(def.key, e.target.checked)
                          }
                        />
                        {savingKey === def.key ? "Saving…" : exists ? "Set" : "Enable"}
                      </label>
                    </li>
                  );
                })}
              </ul>
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
