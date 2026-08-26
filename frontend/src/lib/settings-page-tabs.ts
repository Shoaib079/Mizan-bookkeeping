/** In-page tabs for restaurant settings — order and hash deep-links. */

export type SettingsPageTabId =
  | "company"
  | "menu"
  | "teams"
  | "modules"
  | "opening"
  | "backups";

export type SettingsPageTab = {
  id: SettingsPageTabId;
  label: string;
  /** Location hash used by mobile drill-ins (`#team`, `#branding`, …). */
  hash: string;
};

/** Exact display order for the settings tab strip. */
export const SETTINGS_PAGE_TABS: readonly SettingsPageTab[] = [
  { id: "company", label: "Company Profile", hash: "company-profile" },
  { id: "menu", label: "Menu & Documents", hash: "branding" },
  { id: "teams", label: "Teams", hash: "team" },
  { id: "modules", label: "Modules", hash: "modules" },
  { id: "opening", label: "Opening Balances", hash: "opening-balances" },
  { id: "backups", label: "Backups", hash: "backups" },
] as const;

export const DEFAULT_SETTINGS_PAGE_TAB: SettingsPageTabId = "company";

export function settingsTabFromHash(hash: string): SettingsPageTabId | null {
  const id = hash.replace(/^#/, "").trim();
  if (!id) return null;
  const match = SETTINGS_PAGE_TABS.find((tab) => tab.hash === id);
  return match?.id ?? null;
}

export function hashForSettingsTab(tabId: SettingsPageTabId): string {
  const tab = SETTINGS_PAGE_TABS.find((t) => t.id === tabId);
  return tab ? `#${tab.hash}` : "";
}
