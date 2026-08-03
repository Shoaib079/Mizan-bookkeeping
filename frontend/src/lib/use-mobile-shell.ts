"use client";

import { useEffect, useState } from "react";

import { mobileShellMediaQuery } from "@/lib/mobile-shell";

/** True when viewport is below the mobile shell breakpoint (820px). */
export function useIsMobileShell(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(mobileShellMediaQuery());
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return mobile;
}
