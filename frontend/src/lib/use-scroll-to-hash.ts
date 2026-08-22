"use client";

import { useEffect } from "react";

/** Scroll to a location hash once content is ready (settings drill-ins). */
export function useScrollToHash(ready: boolean) {
  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const id = window.location.hash.replace(/^#/, "");
    if (!id) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ready]);
}
