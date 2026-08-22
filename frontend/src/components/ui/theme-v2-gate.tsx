"use client";

/** Single gate for chrome that must only appear under data-theme="v2".
 *
 * Accepted-live chrome (left bar + IconSquare) is NOT gated — it is the v1
 * baseline by owner decision 2026-08-22. Everything else exclusive to the
 * remaining v2 look mounts through this marker / ThemeV2Only.
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { THEME_V2_ATTR, THEME_V2_ONLY_ATTR } from "@/lib/theme-v2";

function isInsideThemeV2(node: Element | null): boolean {
  return Boolean(node?.closest(`[data-theme="${THEME_V2_ATTR}"]`));
}

/** Hidden sentinel: present with data-theme-v2-only only inside a v2 scope. */
export function ThemeV2OnlyMarker() {
  const ref = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(false);

  useLayoutEffect(() => {
    setActive(isInsideThemeV2(ref.current));
  }, []);

  return (
    <span
      ref={ref}
      aria-hidden
      className="hidden"
      {...(active ? { [THEME_V2_ONLY_ATTR]: "" } : {})}
    />
  );
}

/** Renders children only when an ancestor (or html) has data-theme=v2. */
export function ThemeV2Only({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(false);

  useLayoutEffect(() => {
    setActive(isInsideThemeV2(ref.current));
  }, []);

  return (
    <span ref={ref} className="contents">
      {active ? children : null}
    </span>
  );
}
