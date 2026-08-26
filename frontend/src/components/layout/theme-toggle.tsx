"use client";

/** Light / Dark / System theme control — tokens flip in globals.css `.dark`. */

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import {
  THEME_MODES,
  getThemeSnapshot,
  hydrateThemePreference,
  setThemeMode,
  subscribeTheme,
  type ThemeMode,
} from "@/lib/theme-preference";
import { cn } from "@/lib/utils";

export type { ThemeMode };

const serverSnapshot = { mode: "system" as ThemeMode, dark: false };

export function useTheme() {
  useEffect(() => {
    hydrateThemePreference();
  }, []);

  const { mode, dark } = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    () => serverSnapshot,
  );

  const mounted = typeof window !== "undefined";

  return {
    mode,
    dark,
    mounted,
    setMode: setThemeMode,
    setDarkMode: (nextDark: boolean) =>
      setThemeMode(nextDark ? "dark" : "light"),
    toggle: () => setThemeMode(dark ? "light" : "dark"),
  };
}

const MODE_META: Record<
  ThemeMode,
  { label: string; icon: typeof Sun; title: string }
> = {
  light: { label: "Light", icon: Sun, title: "Light mode" },
  dark: { label: "Dark", icon: Moon, title: "Dark mode" },
  system: { label: "System", icon: Monitor, title: "Follow system setting" },
};

type ThemeModePickerProps = {
  /** Icon-only compact control for the sidebar. */
  compact?: boolean;
  className?: string;
};

export function ThemeModePicker({
  compact = false,
  className,
}: ThemeModePickerProps) {
  const { mode, setMode } = useTheme();

  return (
    <div
      role="group"
      aria-label="Color theme"
      className={cn(
        "inline-flex rounded-md border border-border bg-[var(--segment-track-bg)] p-0.5",
        className,
      )}
    >
      {THEME_MODES.map((id) => {
        const meta = MODE_META[id];
        const Icon = meta.icon;
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            aria-label={meta.title}
            title={meta.title}
            onClick={() => setMode(id)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors",
              compact ? "size-8 px-0" : "min-w-[4.5rem]",
              active
                ? "bg-[var(--segment-active-bg)] font-semibold text-[var(--segment-active-fg)] shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            {!compact && <span>{meta.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Sidebar / chrome control — Light, Dark, System. */
export function ThemeToggle() {
  return <ThemeModePicker compact />;
}
