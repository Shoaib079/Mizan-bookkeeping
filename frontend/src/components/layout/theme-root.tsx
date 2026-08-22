"use client";

/** Syncs sandbox/env visual theme onto `<html data-theme>`. */

import { useEffect } from "react";

import { applyVisualTheme, resolveVisualTheme } from "@/lib/theme-v2";

export function ThemeRoot() {
  useEffect(() => {
    applyVisualTheme(resolveVisualTheme());
  }, []);

  return null;
}
