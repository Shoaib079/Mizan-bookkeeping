/** Parse Turkish TRY text → whole kuruş (1 TL = 100). */

export function parseTryToKurus(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, "");
  if (!trimmed) return null;

  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

export function formatKurus(kurus: number): string {
  const lira = kurus / 100;
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(lira);
}

export function formatTry(kurus: number): string {
  return `${formatKurus(kurus)} ₺`;
}

/** DD.MM.YYYY → ISO date string for API. */
export function parseTrDate(input: string): string | null {
  const match = input.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

export function formatTrDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}
