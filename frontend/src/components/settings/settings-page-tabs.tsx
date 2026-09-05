"use client";

import {
  SETTINGS_PAGE_TABS,
  type SettingsPageTabId,
} from "@/lib/settings-page-tabs";
import { TAB_TRACK_WRAP, tabTrackItemClass } from "@/lib/tab-track";

type Props = {
  active: SettingsPageTabId;
  onChange: (id: SettingsPageTabId) => void;
};

/** Page-local settings tabs — same track chrome as SectionTabs. */
export function SettingsPageTabs({ active, onChange }: Props) {
  return (
    <div
      className={TAB_TRACK_WRAP}
      role="tablist"
      aria-label="Restaurant settings"
      data-testid="settings-page-tabs"
    >
      {SETTINGS_PAGE_TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            id={`settings-tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={tabTrackItemClass(isActive)}
            data-segment-active={isActive ? "true" : "false"}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
