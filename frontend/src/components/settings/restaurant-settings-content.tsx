"use client";

import { FormPage, FormSection } from "@/components/page/form-page";
import Link from "next/link";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { BackupsInfoPanel } from "@/components/settings/backups-info-panel";
import { CompanyProfilePanel } from "@/components/settings/company-profile-panel";
import { DeleteRestaurantPanel } from "@/components/settings/delete-restaurant-panel";
import { EntityFeatureToggles } from "@/components/settings/entity-feature-toggles";
import { RestaurantBrandingPanel } from "@/components/settings/restaurant-branding-panel";
import { SettingsPageTabs } from "@/components/settings/settings-page-tabs";
import { TeamPanel } from "@/components/settings/team-panel";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { saveEntitySetting } from "@/lib/save-entity-setting";
import {
  DEFAULT_SETTINGS_PAGE_TAB,
  hashForSettingsTab,
  settingsTabFromHash,
  type SettingsPageTabId,
} from "@/lib/settings-page-tabs";
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

function readInitialTab(): SettingsPageTabId {
  if (typeof window === "undefined") return DEFAULT_SETTINGS_PAGE_TAB;
  return (
    settingsTabFromHash(window.location.hash) ?? DEFAULT_SETTINGS_PAGE_TAB
  );
}

export function RestaurantSettingsContent() {
  const { entityId, refreshEntities } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const [activeTab, setActiveTab] =
    useState<SettingsPageTabId>(DEFAULT_SETTINGS_PAGE_TAB);
  const [hashReady, setHashReady] = useState(false);

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

  useEffect(() => {
    const tab = readInitialTab();
    setActiveTab(tab);
    setHashReady(true);
  }, []);

  const selectTab = useCallback((id: SettingsPageTabId) => {
    setActiveTab(id);
    if (typeof window === "undefined") return;
    const next = hashForSettingsTab(id);
    if (window.location.hash !== next) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
    }
  }, []);

  useEffect(() => {
    if (!hashReady) return;
    function onHashChange() {
      const tab = settingsTabFromHash(window.location.hash);
      if (tab) setActiveTab(tab);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [hashReady]);

  const reloadSettings = useCallback(async () => {
    if (!entityId) {
      setSettings([]);
      setProfile(null);
      return;
    }
    setSettingsLoading(true);
    setSettingsError(null);
    setProfileLoading(true);
    setProfileError(null);
    try {
      const [settingsRes, entityRes] = await Promise.all([
        apiFetch<{ items: EntitySettingRow[] }>(
          `/entities/${entityId}/settings?limit=200`,
        ),
        apiFetch<EntityProfile>(`/entities/${entityId}`),
      ]);
      setSettings(settingsRes.items);
      setProfile(entityRes);
      setProfileName(entityRes.name);
      setProfileLegalName(entityRes.legal_name ?? "");
      setProfileVkn(entityRes.vkn ?? "");
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Failed to load");
      setSettings([]);
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
    <FormPage title="Restaurant settings" width="wide">
      <SettingsPageTabs active={activeTab} onChange={selectTab} />

      {activeTab === "company" && (
        <CompanyProfilePanel
          profileName={profileName}
          profileLegalName={profileLegalName}
          profileVkn={profileVkn}
          profileLoading={profileLoading}
          profileSaving={profileSaving}
          profileError={profileError}
          hasProfile={!!profile}
          onNameChange={setProfileName}
          onLegalNameChange={setProfileLegalName}
          onVknChange={setProfileVkn}
          onSubmit={onSaveCompanyProfile}
        />
      )}

      {activeTab === "menu" && <RestaurantBrandingPanel embedded />}

      {activeTab === "teams" && (
        <FormSection id="team">
          <p className="text-sm text-muted-foreground">
            Members who can access this restaurant and their roles.
          </p>
          <div className="mt-4 min-w-0">
            <TeamPanel />
          </div>
        </FormSection>
      )}

      {activeTab === "modules" && (
        <FormSection id="modules">
          <p className="text-sm text-muted-foreground">
            Per-restaurant feature toggles. Turn modules on or off when your
            needs change.
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
        </FormSection>
      )}

      {activeTab === "opening" && (
        <FormSection id="opening-balances">
          <p className="text-sm text-muted-foreground">
            Go-live date, cash and bank balances, payables, and equity — the
            starting point your books measure from.
          </p>
          <Link
            href="/onboarding/opening-balances"
            className="mt-3 inline-block text-sm text-primary hover:underline"
          >
            Review opening balances →
          </Link>
        </FormSection>
      )}

      {activeTab === "backups" && <BackupsInfoPanel embedded />}

      {/* Always below the tab panels — read Backups before deleting. */}
      <DeleteRestaurantPanel />
    </FormPage>
  );
}
