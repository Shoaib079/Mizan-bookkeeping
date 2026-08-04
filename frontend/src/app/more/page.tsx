"use client";

/** Mobile "More" menu — DESIGN_ARCHETYPES §4 (hub). */

import { AppShell } from "@/components/layout/app-shell";
import { MobileMoreMenu } from "@/components/layout/mobile-more-menu";
import { PageHeader } from "@/components/page/page-header";

export default function MorePage() {
  return (
    <AppShell title="More">
      <PageHeader title="More" />
      <MobileMoreMenu />
    </AppShell>
  );
}
