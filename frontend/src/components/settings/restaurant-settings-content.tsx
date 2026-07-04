"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { BackupsInfoPanel } from "@/components/settings/backups-info-panel";
import {
  EntityFeatureToggles,
} from "@/components/settings/entity-feature-toggles";
import { TeamPanel } from "@/components/settings/team-panel";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { saveEntitySetting } from "@/lib/save-entity-setting";
import { type EntitySettingRow } from "@/lib/settings-types";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { normalizeVknInput, vknValidationMessage } from "@/lib/vkn";

type EntityProfile = {
  id: string;
  name: string;
  legal_name: string | null;
  vkn: string | null;
};

export function RestaurantSettingsContent() {
  const { entityId, refreshEntities } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

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

  const reloadSettings = useCallback(async () => {
    if (!entityId) {
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
          `/entities/${entityId}/settings?limit=200`,
        ),
        apiFetch<{ total: number }>(
          `/entities/${entityId}/chart-of-accounts?limit=1`,
        ),
        apiFetch<EntityProfile>(`/entities/${entityId}`),
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
  }, [entityId]);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  function settingValue(key: string): boolean {
    const row = settings.find((s) => s.key === key);
    return row !== undefined && row.value.trim().toLowerCase() === "true";
  }

  async function onSaveCompanyProfile(event: FormEvent) {
    event.preventDefault();
    if (!entityId) return;
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
    if (!entityId) return;
    setSavingKey(key);
    setSettingsError(null);
    try {
      const existingKeys = new Set(settings.map((s) => s.key));
      await saveEntitySetting(
        entityId,
        key,
        enabled,
        existingKeys,
        submitIdempotency,
      );
      await reloadSettings();
      toast("Module setting saved");
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingKey(null);
    }
  }

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar, or use the account menu to add one.
      </p>
    );
  }

  return (
    <div className="max-w-xl space-y-8">
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Company profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your registered business details — used to identify your company on
          e-Fatura uploads (buyer vs supplier).
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
        <h2 className="text-sm font-semibold">Modules</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-restaurant feature toggles. Turn modules on or off when your needs
          change.
        </p>
        {settingsLoading && (
          <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        )}
        {settingsError && (
          <p className="mt-3 text-sm text-destructive">{settingsError}</p>
        )}
        <EntityFeatureToggles
          settings={settings}
          checkedFor={settingValue}
          onChange={(key, enabled) => onToggleSetting(key, enabled)}
          disabled={settingsLoading}
          savingKey={savingKey}
          refreshDeliveryNavAfterSave
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Team</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Members who can access this restaurant and their roles.
        </p>
        <div className="mt-4">
          <TeamPanel />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Chart of accounts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {chartCount === null
            ? "Loading…"
            : `${chartCount} account${chartCount === 1 ? "" : "s"} on chart.`}
        </p>
      </section>

      <BackupsInfoPanel />
    </div>
  );
}
