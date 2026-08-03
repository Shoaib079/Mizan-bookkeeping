/** Deterministic restaurant colours + initials — Phase 12 Slice 12.0b. */

const ENTITY_PALETTE = [
  "var(--entity-0)",
  "var(--entity-1)",
  "var(--entity-2)",
  "var(--entity-3)",
  "var(--entity-4)",
  "var(--entity-5)",
  "var(--entity-6)",
  "var(--entity-7)",
] as const;

function hashEntityId(entityId: string): number {
  let hash = 0;
  for (let i = 0; i < entityId.length; i += 1) {
    hash = (hash * 31 + entityId.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function entityAccentColor(entityId: string): string {
  if (!entityId) return ENTITY_PALETTE[0];
  return ENTITY_PALETTE[hashEntityId(entityId) % ENTITY_PALETTE.length];
}

export function entityInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function userInitials(displayName: string, email: string): string {
  const fromName = entityInitial(displayName);
  if (fromName !== "?") return fromName;
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return "?";
  return local.slice(0, 2).toUpperCase();
}
