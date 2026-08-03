"use client";

import { AppShell } from "@/components/layout/app-shell";
import { MobileMoreMenu } from "@/components/layout/mobile-more-menu";

export default function MorePage() {
  return (
    <AppShell title="More">
      <MobileMoreMenu />
    </AppShell>
  );
}
