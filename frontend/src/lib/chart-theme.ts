/** Recharts styling — reads CSS tokens so charts follow light/dark theme. */

export const chartSeriesColors = {
  cash: "var(--chart-cash)",
  posCard: "var(--chart-pos)",
  delivery: "var(--chart-delivery)",
  groupSales: "var(--chart-group)",
  other: "var(--chart-other)",
  sales: "var(--chart-sales)",
  expenses: "var(--chart-expenses)",
  net: "var(--chart-net)",
} as const;

export function chartAxisTick(fontSize = 11) {
  return { fontSize, fill: "var(--chart-axis)" };
}

export const chartTooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  color: "var(--foreground)",
};

export const chartLegendStyle = {
  color: "var(--foreground)",
};
