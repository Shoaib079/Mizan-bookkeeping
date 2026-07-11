"use client";

/** Light/dark theme control — tokens flip in globals.css `.dark` block.
 * One hook owns the logic; the top-bar button and the profile page share it. */

import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const KEY = "mizan:theme";

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

export function initialDarkPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored === "dark") return true;
    if (stored === "light") return false;
  } catch {
    // ignore
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function useTheme() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = initialDarkPreference();
    setDark(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  const setDarkMode = useCallback((next: boolean) => {
    setDark(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(() => setDarkMode(!dark), [dark, setDarkMode]);

  return { dark, mounted, toggle, setDarkMode };
}

export function ThemeToggle() {
  const { dark, mounted, toggle } = useTheme();

  return (
    <button
      type="button"
      className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      onClick={toggle}
    >
      {mounted && dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
