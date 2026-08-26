/** Month-over-month % change for dashboard StatCard trends. */

export type MonthOverMonthTrend = {
  value: string;
  direction: "up" | "down" | "flat";
};

/** Compare this-period kuruş to the prior period (same length last month). */
export function monthOverMonthTrend(
  currentKurus: number,
  priorKurus: number,
): MonthOverMonthTrend {
  if (currentKurus === priorKurus) {
    return { value: "0%", direction: "flat" };
  }
  if (priorKurus === 0) {
    return {
      value: currentKurus > 0 ? "New" : "0%",
      direction: currentKurus > 0 ? "up" : "flat",
    };
  }
  const pct = Math.round(
    ((currentKurus - priorKurus) / Math.abs(priorKurus)) * 100,
  );
  if (pct === 0) {
    return { value: "0%", direction: "flat" };
  }
  const sign = pct > 0 ? "+" : "";
  return {
    value: `${sign}${pct}%`,
    direction: pct > 0 ? "up" : "down",
  };
}
