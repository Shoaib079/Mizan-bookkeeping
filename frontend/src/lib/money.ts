/** Parse/format Turkish TRY as integer kuruş (Decisions §5, CURSOR_RULES §1 rule 15). */

/** Strip currency symbols and non-numeric junk; keep digits, comma, dot, leading minus. */
export function sanitizeTryInput(raw: string): string {
  let s = raw.replace(/[₺]/g, "").replace(/\bTL\b/gi, "").replace(/\s/g, "");
  s = s.replace(/[^\d,.\-]/g, "");
  if (!s) return "";

  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  if (negative) s = `-${s}`;

  return s;
}

export function parseTryParts(cleaned: string): { whole: string; frac: string } | null {
  if (!cleaned || !/^[\d.,]+$/.test(cleaned)) return null;

  if (cleaned.includes(",")) {
    const parts = cleaned.split(",");
    if (parts.length !== 2) return null;
    const [wholePart, fracPart] = parts;
    if (fracPart !== undefined && !/^\d{0,2}$/.test(fracPart)) return null;
    const whole = wholePart.replace(/\./g, "");
    if (!/^\d+$/.test(whole)) return null;
    return { whole, frac: fracPart ?? "" };
  }

  if (cleaned.includes(".")) {
    const dotParts = cleaned.split(".");
    const last = dotParts[dotParts.length - 1] ?? "";
    if (last.length <= 2 && dotParts.length > 1) {
      const whole = dotParts.slice(0, -1).join("");
      if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(last)) return null;
      return { whole, frac: last };
    }
    const whole = cleaned.replace(/\./g, "");
    if (!/^\d+$/.test(whole)) return null;
    return { whole, frac: "00" };
  }

  if (!/^\d+$/.test(cleaned)) return null;
  return { whole: cleaned, frac: "00" };
}

/** Parse Turkish TRY text → whole kuruş. Rejects letters/garbage (never parseFloat). */
export function parseTryToKurus(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withoutCurrency = trimmed
    .replace(/[₺]/g, "")
    .replace(/\bTL\b/gi, "")
    .replace(/\s/g, "");
  if (!withoutCurrency) return null;
  if (/[a-zA-Z]/.test(withoutCurrency)) return null;

  let negative = false;
  let cleaned = withoutCurrency;
  if (cleaned.startsWith("-")) {
    negative = true;
    cleaned = cleaned.slice(1);
  }
  if (!cleaned) return null;

  const parts = parseTryParts(cleaned);
  if (!parts) return null;

  const fracPadded = parts.frac.padEnd(2, "0");
  const value = Number.parseInt(parts.whole, 10) * 100 + Number.parseInt(fracPadded, 10);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
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
