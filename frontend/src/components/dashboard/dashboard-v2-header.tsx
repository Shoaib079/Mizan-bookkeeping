"use client";

/** v2-only dashboard chrome: greeting + display name only.
 * Restaurant identity lives in the top bar / account menu — not here.
 * Period analysis lives in Reports (dashboard is as-of-only). */

import { ThemeV2OnlyMarker } from "@/components/ui/theme-v2-gate";
import { dashboardGreetingLine } from "@/lib/dashboard-greeting";
import { cn } from "@/lib/utils";

type Props = {
  displayName: string | null | undefined;
  className?: string;
  /** Injected for tests — defaults to now. */
  now?: Date;
};

export function DashboardV2Header({ displayName, className, now }: Props) {
  const greeting = dashboardGreetingLine(displayName, now);

  return (
    <header
      data-testid="dashboard-v2-header"
      className={cn("mb-5", className)}
    >
      <ThemeV2OnlyMarker />
      <div data-testid="dashboard-v2-header-row">
        <h1
          data-testid="dashboard-v2-greeting"
          className="min-w-0 text-base font-bold leading-snug text-[#0B1526]"
        >
          {greeting}
        </h1>
      </div>
    </header>
  );
}
