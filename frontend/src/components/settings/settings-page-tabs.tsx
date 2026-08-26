"use client";

import {
  SETTINGS_PAGE_TABS,
  type SettingsPageTabId,
} from "@/lib/settings-page-tabs";
import { cn } from "@/lib/utils";

type Props = {
  active: SettingsPageTabId;
  onChange: (id: SettingsPageTabId) => void;
};

/** Page-local settings tabs — same chrome size as SectionTabs, not nav-routed. */
export function SettingsPageTabs({ active, onChange }: Props) {
  return (
    <div
      className="mb-4 flex flex-wrap gap-1 border-b border-border"
      role="tablist"
      aria-label="Restaurant settings"
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
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 rounded-t-md border border-transparent px-4 py-2.5 text-base font-medium text-muted-foreground hover:text-foreground",
              isActive &&
                "border-border border-b-background bg-background text-primary",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
