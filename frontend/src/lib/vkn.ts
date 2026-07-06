/** Turkish tax id (VKN / vergi numarası) — 10–11 digits. */

const VKN_PATTERN = /^\d{10,11}$/;

export function normalizeVknInput(value: string): string {
  return value.replace(/\s+/g, "");
}

export function isValidVkn(value: string): boolean {
  return VKN_PATTERN.test(normalizeVknInput(value));
}

export function vknValidationMessage(value: string): string | null {
  const cleaned = normalizeVknInput(value);
  if (!cleaned) return "Vergi numarası is required";
  if (!isValidVkn(cleaned)) return "Vergi numarası must be 10 or 11 digits";
  return null;
}

/** Optional VKN/TCKN — empty is fine; filled must be 10–11 digits. */
export function optionalTaxIdValidationMessage(value: string): string | null {
  const cleaned = normalizeVknInput(value);
  if (!cleaned) return null;
  if (!isValidVkn(cleaned)) return "Must be a valid 10-digit VKN or 11-digit TCKN";
  return null;
}
