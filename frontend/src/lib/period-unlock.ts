/** Detect soft period-lock 422 responses that can retry with period_unlock_reason. */

import { ApiError } from "@/lib/api";

export function isPeriodLockError(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 422) return false;
  const msg = err.message.toLowerCase();
  if (msg.includes("period_unlock_reason")) return true;
  if (msg.includes("closed period") && !msg.includes("owner unlock required")) {
    return true;
  }
  return false;
}

export function withPeriodUnlockReason<T extends Record<string, unknown>>(
  payload: T,
  periodUnlockReason?: string,
): T & { period_unlock_reason?: string } {
  if (!periodUnlockReason?.trim()) return payload;
  return { ...payload, period_unlock_reason: periodUnlockReason.trim() };
}
