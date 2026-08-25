"use client";

/** Dashboard chrome: greeting + display name (v2 is the only look). */

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
      <div data-testid="dashboard-v2-header-row">
        <h1
          data-testid="dashboard-v2-greeting"
          className="min-w-0 text-base font-bold leading-snug text-ink-strong"
        >
          {greeting}
        </h1>
      </div>
    </header>
  );
}
