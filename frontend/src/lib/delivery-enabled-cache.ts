/** Per-entity delivery_enabled cache + invalidation (nav / quick actions). */

import { isEntitySettingEnabled } from "@/lib/entity-settings";

export const DELIVERY_ENABLED_CHANGED_EVENT = "mizan:delivery-enabled-changed";

const deliveryEnabledCache = new Map<string, boolean>();

export function getCachedDeliveryEnabled(
  entityId: string,
): boolean | undefined {
  return deliveryEnabledCache.get(entityId);
}

export function setCachedDeliveryEnabled(
  entityId: string,
  enabled: boolean,
): void {
  deliveryEnabledCache.set(entityId, enabled);
}

export function clearDeliveryEnabledCache(entityId: string): void {
  deliveryEnabledCache.delete(entityId);
}

/**
 * Fetch delivery_enabled for one entity.
 * Returns null on fetch failure (pre-auth / network) — does NOT cache false.
 * Only successful responses update the cache.
 */
export async function fetchDeliveryEnabled(
  entityId: string,
): Promise<boolean | null> {
  try {
    const enabled = await isEntitySettingEnabled(entityId, "delivery_enabled");
    deliveryEnabledCache.set(entityId, enabled);
    return enabled;
  } catch {
    return null;
  }
}

/** Drop cached value and notify listeners for one entity (SEC-3: scoped by entityId). */
export function invalidateDeliveryEnabled(entityId: string): void {
  deliveryEnabledCache.delete(entityId);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(DELIVERY_ENABLED_CHANGED_EVENT, { detail: { entityId } }),
  );
}

export async function refreshDeliveryEnabledForEntity(
  entityId: string,
): Promise<boolean | null> {
  deliveryEnabledCache.delete(entityId);
  return fetchDeliveryEnabled(entityId);
}
