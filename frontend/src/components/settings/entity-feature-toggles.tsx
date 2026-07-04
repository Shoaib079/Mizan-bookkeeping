"use client";

import { useQuickActions } from "@/components/quick-actions";
import {
  KNOWN_ENTITY_SETTINGS,
  type EntitySettingRow,
} from "@/lib/settings-types";

type EntityFeatureTogglesProps = {
  settings: EntitySettingRow[];
  checkedFor: (key: string) => boolean;
  onChange: (key: string, enabled: boolean) => void | Promise<void>;
  disabled: boolean;
  savingKey: string | null;
  showKeyDebug?: boolean;
  /** When true, refresh delivery nav after delivery_enabled persists (settings page). */
  refreshDeliveryNavAfterSave?: boolean;
};

export function EntityFeatureToggles({
  settings,
  checkedFor,
  onChange,
  disabled,
  savingKey,
  showKeyDebug = true,
  refreshDeliveryNavAfterSave = false,
}: EntityFeatureTogglesProps) {
  const { refreshDeliveryEnabled } = useQuickActions();

  async function handleToggle(key: string, enabled: boolean) {
    await onChange(key, enabled);
    if (refreshDeliveryNavAfterSave && key === "delivery_enabled") {
      await refreshDeliveryEnabled();
    }
  }

  return (
    <ul className="mt-4 space-y-4">
      {KNOWN_ENTITY_SETTINGS.map((def) => {
        const checked = checkedFor(def.key);
        const exists = settings.some((s) => s.key === def.key);
        return (
          <li key={def.key} className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{def.label}</p>
              <p className="text-xs text-muted-foreground">{def.description}</p>
              {showKeyDebug && (
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
                onChange={(e) => void handleToggle(def.key, e.target.checked)}
              />
              {savingKey === def.key ? "Saving…" : checked ? "On" : "Off"}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function defaultModuleDraft(): Record<string, boolean> {
  return Object.fromEntries(KNOWN_ENTITY_SETTINGS.map((def) => [def.key, false]));
}
