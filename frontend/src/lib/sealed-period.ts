/** What the sealed-period banner should say — pure, so it can be pinned.
 *
 * The swap between sealed and live figures is otherwise invisible: same page,
 * same shape of numbers, but one is history and one is today.
 */

import type { ReportSource, SealedPeriodInfo } from "@/lib/report-types";

export type BannerState =
  | { kind: "none" }
  /** Sealed figures, nothing changed since the close. */
  | { kind: "sealed"; closedOn: string }
  /** Sealed figures, but the live books have moved. */
  | { kind: "drifted"; closedOn: string; driftKurus: number | null }
  /** Deliberately looking at live figures for a month that is sealed. */
  | { kind: "viewing_live" };

export function bannerState(args: {
  source: ReportSource;
  sealed: SealedPeriodInfo | null;
  view: ReportSource;
}): BannerState {
  const { source, sealed, view } = args;
  if (view === "live" && source === "live") return { kind: "viewing_live" };
  if (source !== "as_closed" || !sealed) return { kind: "none" };
  const closedOn = sealed.closed_at.slice(0, 10);
  return sealed.drifted
    ? { kind: "drifted", closedOn, driftKurus: sealed.drift_kurus }
    : { kind: "sealed", closedOn };
}

/** True when the drift is worth putting a number on. */
export function hasMeaningfulDrift(state: BannerState): boolean {
  return (
    state.kind === "drifted" &&
    state.driftKurus !== null &&
    state.driftKurus !== 0
  );
}
