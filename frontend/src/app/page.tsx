"use client";

/** Dashboard — live KPIs from GET .../dashboard (Phase 9 Slice 8).
 * As-of balances on home; period analysis lives in Reports. */

import { DashboardHomeContent } from "@/components/dashboard/dashboard-home-content";
import { AppShell } from "@/components/layout/app-shell";

export default function HomePage() {
  return (
    <AppShell title="Dashboard">
      <DashboardHomeContent />
    </AppShell>
  );
}
