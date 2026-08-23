"use client";

/** Sandbox-only A/B switch for mobile visual refresh v2 (env-gated). */

import { useCallback, useEffect, useState } from "react";

import {
  applyVisualTheme,
  envDefaultTheme,
  isThemeToggleEnabled,
  resolveVisualTheme,
  subscribeVisualTheme,
  writeStoredVisualTheme,
  type AppVisualTheme,
} from "@/lib/theme-v2";
import { canAccessThemePreview } from "@/lib/entity-access";
import { useEntityAccess } from "@/lib/use-entity-access";
import { cn } from "@/lib/utils";

export function useNewLookTheme() {
  const [theme, setThemeState] = useState<AppVisualTheme>("v1");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const next = resolveVisualTheme();
    setThemeState(next);
    applyVisualTheme(next);
    setMounted(true);
    // Shared bus: New look toggle lives in another hook instance; without this,
    // siblings keep stale theme until remount (Cash & bank dividers / KPI layout).
    return subscribeVisualTheme(setThemeState);
  }, []);

  const setTheme = useCallback((next: AppVisualTheme) => {
    setThemeState(next);
    applyVisualTheme(next);
    writeStoredVisualTheme(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "v2" ? "v1" : "v2");
  }, [setTheme, theme]);

  return { theme, mounted, toggle, setTheme, defaultTheme: envDefaultTheme() };
}

/** Owner-visible “New look on/off” — renders nothing unless toggle env is on. */
export function NewLookToggle({ className }: { className?: string }) {
  const enabled = isThemeToggleEnabled();
  const { role, membershipSettled } = useEntityAccess();
  const { theme, mounted, toggle } = useNewLookTheme();

  if (!enabled) return null;
  if (!membershipSettled || !canAccessThemePreview(role)) return null;

  const on = theme === "v2";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="New look"
      title={on ? "New look on" : "New look off"}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md border border-border px-2.5 text-xs font-medium transition-colors",
        on
          ? "border-primary/40 bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        className,
      )}
      onClick={toggle}
    >
      <span
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full transition-colors",
          on ? "bg-primary" : "bg-muted",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute top-0.5 size-3 rounded-full bg-card shadow transition-transform",
            on ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </span>
      <span>{mounted ? (on ? "New look on" : "New look off") : "New look"}</span>
    </button>
  );
}
