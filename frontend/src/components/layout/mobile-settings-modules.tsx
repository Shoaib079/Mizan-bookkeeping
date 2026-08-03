"use client";

import { useCallback, useEffect, useState } from "react";

import { useQuickActions } from "@/components/quick-actions";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { saveEntitySetting } from "@/lib/save-entity-setting";
import {
  KNOWN_ENTITY_SETTINGS,
  type EntitySettingRow,
} from "@/lib/settings-types";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

function settingValue(settings: EntitySettingRow[], key: string): boolean {
  const row = settings.find((s) => s.key === key);
  if (!row) return false;
  return row.value === "true";
}

/** Inline iOS-style module toggles on mobile Settings hub (C4.6). */
export function MobileSettingsModules() {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const { refreshDeliveryEnabled } = useQuickActions();
  const submitIdempotency = useSubmitIdempotency();
  const [settings, setSettings] = useState<EntitySettingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!entityId) {
      setSettings([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ items: EntitySettingRow[] }>(
        `/entities/${entityId}/settings?limit=200`,
      );
      setSettings(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load modules");
      setSettings([]);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onToggle(key: string, enabled: boolean) {
    if (!entityId) return;
    setSavingKey(key);
    setError(null);
    try {
      const existingKeys = new Set(settings.map((s) => s.key));
      await saveEntitySetting(
        entityId,
        key,
        enabled,
        existingKeys,
        submitIdempotency,
      );
      await reload();
      if (key === "delivery_enabled") {
        await refreshDeliveryEnabled();
      }
      toast("Module setting saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingKey(null);
    }
  }

  if (!entityId) return null;

  return (
    <section className="mb-5">
      <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
        Modules
      </h2>
      <div className="overflow-hidden rounded-xl bg-card shadow-sm">
        {loading && (
          <p className="px-4 py-3 text-sm text-muted-foreground">Loading…</p>
        )}
        {error && (
          <p className="px-4 py-3 text-sm text-destructive">{error}</p>
        )}
        {KNOWN_ENTITY_SETTINGS.map((def, index) => {
          const on = settingValue(settings, def.key);
          const saving = savingKey === def.key;
          return (
            <div
              key={def.key}
              className={cn(
                "flex min-h-[52px] items-center justify-between gap-3 px-4 py-3",
                index < KNOWN_ENTITY_SETTINGS.length - 1 &&
                  "border-b border-[#f2f2f7]",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-base">{def.label}</p>
                <p className="text-xs text-muted-foreground">{def.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                disabled={loading || saving}
                onClick={() => void onToggle(def.key, !on)}
                className={cn(
                  "relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors",
                  on ? "bg-success" : "bg-muted",
                  (loading || saving) && "opacity-50",
                )}
              >
                <span
                  className={cn(
                    "absolute top-[2px] size-[27px] rounded-full bg-white shadow transition-[left]",
                    on ? "left-[22px]" : "left-[2px]",
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
