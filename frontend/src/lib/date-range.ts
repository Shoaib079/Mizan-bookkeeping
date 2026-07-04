/** Date range helpers for dashboard and reports. */

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  return { from: toIso(from), to: toIso(to) };
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildRangeQuery(from: string, to: string): string {
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}
