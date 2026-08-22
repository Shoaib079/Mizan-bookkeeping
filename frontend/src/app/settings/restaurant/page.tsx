"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { MobileSettingsHub } from "@/components/layout/mobile-settings-hub";
import { RestaurantSettingsContent } from "@/components/settings/restaurant-settings-content";
import { useIsMobileShell } from "@/lib/use-mobile-shell";

export default function RestaurantSettingsPage() {
  const isMobile = useIsMobileShell();
  const searchParams = useSearchParams();
  const showFull = searchParams.get("full") === "1";

  return (
    <AppShell title={isMobile && !showFull ? "Settings" : "Restaurant settings"}>
      {isMobile && showFull && (
        <Link
          href="/settings/restaurant"
          className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary active:opacity-70"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Settings
        </Link>
      )}
      {isMobile && !showFull ? (
        <MobileSettingsHub />
      ) : (
        <RestaurantSettingsContent />
      )}
    </AppShell>
  );
}
