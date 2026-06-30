"use client";

import { AppShell } from "@/components/layout/app-shell";
import { RestaurantSettingsContent } from "@/components/settings/restaurant-settings-content";

export default function RestaurantSettingsPage() {
  return (
    <AppShell title="Restaurant settings">
      <RestaurantSettingsContent />
    </AppShell>
  );
}
