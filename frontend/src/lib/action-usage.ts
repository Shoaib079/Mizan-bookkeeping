/**
 * Per-entity action usage tracking (localStorage).
 *
 * Records how often each RecordActionKey is used per entity,
 * and returns a ranked list of top actions for the "Most used" section.
 */

import type { RecordActionKey } from "@/lib/record-actions";

const STORAGE_PREFIX = "mizan:action-usage:";
const MAX_RECENT = 50;

export const DEFAULT_TOP_ACTIONS: RecordActionKey[] = [
  "closeDay",
  "expense",
  "sales",
  "addDocument",
];

type UsageRecord = { counts: Record<string, number> };

function storageKey(entityId: string): string {
  return `${STORAGE_PREFIX}${entityId}`;
}

function readUsage(entityId: string): UsageRecord {
  try {
    const raw = localStorage.getItem(storageKey(entityId));
    if (!raw) return { counts: {} };
    const parsed = JSON.parse(raw) as UsageRecord;
    if (!parsed.counts || typeof parsed.counts !== "object") return { counts: {} };
    return parsed;
  } catch {
    return { counts: {} };
  }
}

function writeUsage(entityId: string, record: UsageRecord): void {
  try {
    localStorage.setItem(storageKey(entityId), JSON.stringify(record));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function recordActionUsage(entityId: string, actionId: RecordActionKey): void {
  const usage = readUsage(entityId);
  usage.counts[actionId] = (usage.counts[actionId] ?? 0) + 1;

  const entries = Object.entries(usage.counts);
  if (entries.length > MAX_RECENT) {
    const sorted = entries.sort(([, a], [, b]) => b - a);
    usage.counts = Object.fromEntries(sorted.slice(0, MAX_RECENT));
  }

  writeUsage(entityId, usage);
}

/**
 * Returns the top N action IDs ranked by usage count (descending).
 * Falls back to DEFAULT_TOP_ACTIONS when no usage history exists.
 */
export function getTopActions(
  entityId: string,
  limit: number = 4,
): RecordActionKey[] {
  const usage = readUsage(entityId);
  const entries = Object.entries(usage.counts);

  if (entries.length === 0) {
    return DEFAULT_TOP_ACTIONS.slice(0, limit);
  }

  return entries
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([key]) => key as RecordActionKey);
}

export function clearActionUsage(entityId: string): void {
  try {
    localStorage.removeItem(storageKey(entityId));
  } catch {
    // ignore
  }
}
