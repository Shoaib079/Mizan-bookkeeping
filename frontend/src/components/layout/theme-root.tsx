"use client";

/** Ensures `<html data-theme="v2">` after hydrate (matches SSR bake). */

import { useEffect } from "react";

import { applyVisualTheme } from "@/lib/theme-v2";

export function ThemeRoot() {
  useEffect(() => {
    applyVisualTheme();
  }, []);
  return null;
}
