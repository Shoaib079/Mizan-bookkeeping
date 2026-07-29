"use client";

/** Tells you when a report is showing a sealed month rather than the live books.
 *
 * Without this the swap would be invisible: the same page, the same numbers
 * shape, but one is history and one is today. Silence would be worse than not
 * freezing at all.
 */

import Link from "next/link";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatTrDate, formatTry } from "@/lib/money";
import type { ReportSource, SealedPeriodInfo } from "@/lib/report-types";
import { bannerState, hasMeaningfulDrift } from "@/lib/sealed-period";
import { cn } from "@/lib/utils";

type Props = {
  source: ReportSource;
  sealed: SealedPeriodInfo | null;
  /** Which view the page is currently requesting. */
  view: ReportSource;
  onViewChange: (view: ReportSource) => void;
};

export function SealedPeriodBanner({ source, sealed, view, onViewChange }: Props) {
  const state = bannerState({ source, sealed, view });

  if (state.kind === "none") return null;

  // Viewing live on a month that is in fact sealed — offer the way back.
  if (state.kind === "viewing_live") {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm">
        <span className="text-muted-foreground">
          Showing the live books, including anything changed after this month
          was closed.
        </span>
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2 text-xs"
          onClick={() => onViewChange("as_closed")}
        >
          Show as closed
        </Button>
      </div>
    );
  }

  const drifted = state.kind === "drifted";
  const drift = state.kind === "drifted" ? state.driftKurus : null;
  return (
    <div
      className={cn(
        "mb-4 rounded-lg border px-4 py-3 text-sm",
        drifted
          ? "border-warning/40 bg-warning/5"
          : "border-success/40 bg-success/5",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="font-medium">
              As closed on {formatTrDate(state.closedOn)}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {drifted ? (
                <>
                  Entries have changed since. These are the figures the month
                  was sealed with — what you exported still reads this way.
                  {hasMeaningfulDrift(state) && drift !== null && (
                    <>
                      {" "}
                      The live books now differ by{" "}
                      <span className="font-medium tabular-nums">
                        {drift > 0 ? "+" : ""}
                        {formatTry(drift)}
                      </span>
                      .
                    </>
                  )}
                </>
              ) : (
                <>This month is sealed and nothing has changed since.</>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => onViewChange("live")}
          >
            Show live
          </Button>
          <Link
            href="/reports/month-close"
            className="px-2 text-xs text-primary hover:underline"
          >
            Month close
          </Link>
        </div>
      </div>
    </div>
  );
}
