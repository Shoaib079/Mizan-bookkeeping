"use client";

import { AppShell } from "@/components/layout/app-shell";
import { MobileSettingsHub } from "@/components/layout/mobile-settings-hub";
import { RestaurantSettingsContent } from "@/components/settings/restaurant-settings-content";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import { useSearchParams } from "next/navigation";

export default function RestaurantSettingsPage() {
  const isMobile = useIsMobileShell();
  const searchParams = useSearchParams();
  const showFull = searchParams.get("full") === "1";

  return (
    <AppShell title={isMobile && !showFull ? "Settings" : "Restaurant settings"}>
      {isMobile && !showFull ? (
        <MobileSettingsHub />
      ) : (
        <RestaurantSettingsContent />
      )}
    </AppShell>
  );
}
