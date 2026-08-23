"use client";

/** v2-only dashboard chrome: greeting + restaurant chip left, date range right.
 * Quiet white language — colour only on the restaurant dot. */

import { ThemeV2OnlyMarker } from "@/components/ui/theme-v2-gate";
import { dashboardGreetingLine } from "@/lib/dashboard-greeting";
import { isoToday } from "@/lib/date-range";
import { entityAccentColor } from "@/lib/entity-visual";
import { formatTrDate } from "@/lib/money";
import { cn } from "@/lib/utils";

type Props = {
  displayName: string | null | undefined;
  restaurantId: string | null | undefined;
  restaurantName: string | null | undefined;
  periodControl: React.ReactNode;
  className?: string;
  /** Injected for tests — defaults to now. */
  now?: Date;
};

export function DashboardV2Header({
  displayName,
  restaurantId,
  restaurantName,
  periodControl,
  className,
  now,
}: Props) {
  const greeting = dashboardGreetingLine(displayName, now);
  const todayLabel = formatTrDate(isoToday(now));
  const chipName = restaurantName?.trim() || "Restaurant";
  const accent = entityAccentColor(restaurantId ?? "");

  return (
    <header
      data-testid="dashboard-v2-header"
      className={cn("mb-5", className)}
    >
      <ThemeV2OnlyMarker />
      <div
        data-testid="dashboard-v2-header-row"
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
      >
        <div className="min-w-0 space-y-2">
          <h1
            data-testid="dashboard-v2-greeting"
            className="text-base font-bold leading-snug text-[#0B1526]"
          >
            {greeting}
          </h1>
          <span
            data-testid="dashboard-v2-restaurant-chip"
            className="inline-flex max-w-full items-center gap-2 rounded-md border border-[#E6EAF2] bg-white px-2.5 py-1 text-xs font-medium text-[#3D4A63]"
          >
            <span
              data-testid="dashboard-v2-restaurant-dot"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
            <span className="truncate">
              {chipName}
              <span className="text-muted-foreground"> · </span>
              {todayLabel}
            </span>
          </span>
        </div>
        <div
          data-testid="dashboard-v2-period"
          className="w-full min-w-0 sm:ml-auto sm:w-auto sm:shrink-0 sm:self-start"
        >
          {periodControl}
        </div>
      </div>
    </header>
  );
}
