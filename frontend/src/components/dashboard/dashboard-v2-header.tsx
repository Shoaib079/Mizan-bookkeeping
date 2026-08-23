"use client";

/** v2-only dashboard chrome: greeting left, today's date (+ desktop range) right.
 * Restaurant identity lives in the top bar / account menu — not here. */

import { ThemeV2OnlyMarker } from "@/components/ui/theme-v2-gate";
import { dashboardGreetingLine } from "@/lib/dashboard-greeting";
import { isoToday } from "@/lib/date-range";
import { formatTrDate } from "@/lib/money";
import { cn } from "@/lib/utils";

type Props = {
  displayName: string | null | undefined;
  /** Desktop (≥sm) period fields — sits beside today's date. */
  periodDesktop: React.ReactNode;
  /** Mobile (&lt;sm) period chip — sits below the greeting row. */
  periodMobile: React.ReactNode;
  className?: string;
  /** Injected for tests — defaults to now. */
  now?: Date;
};

export function DashboardV2Header({
  displayName,
  periodDesktop,
  periodMobile,
  className,
  now,
}: Props) {
  const greeting = dashboardGreetingLine(displayName, now);
  const todayLabel = formatTrDate(isoToday(now));

  return (
    <header
      data-testid="dashboard-v2-header"
      className={cn("mb-5", className)}
    >
      <ThemeV2OnlyMarker />
      <div
        data-testid="dashboard-v2-header-row"
        className="flex items-center justify-between gap-4"
      >
        <h1
          data-testid="dashboard-v2-greeting"
          className="min-w-0 text-base font-bold leading-snug text-[#0B1526]"
        >
          {greeting}
        </h1>
        <div
          data-testid="dashboard-v2-right"
          className="flex shrink-0 items-center gap-3"
        >
          <time
            data-testid="dashboard-v2-today"
            dateTime={isoToday(now)}
            className="text-[13px] tabular-nums text-[#3D4A63]"
          >
            {todayLabel}
          </time>
          <div
            data-testid="dashboard-v2-period-desktop"
            className="hidden sm:block"
          >
            {periodDesktop}
          </div>
        </div>
      </div>
      <div
        data-testid="dashboard-v2-period-mobile"
        className="mt-4 sm:hidden"
      >
        {periodMobile}
      </div>
    </header>
  );
}
