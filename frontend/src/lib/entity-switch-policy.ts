/** Global entity-switch policy — one rule for desktop, mobile, and every entry point. */

export type EntitySwitchPolicy = {
  /** When false, user may not change mizan.entityId away from lockedEntityId. */
  canSwitch: boolean;
  lockedEntityId: string | null;
};

const DEFAULT_POLICY: EntitySwitchPolicy = {
  canSwitch: true,
  lockedEntityId: null,
};

let policy: EntitySwitchPolicy = DEFAULT_POLICY;
const listeners = new Set<() => void>();

export function getEntitySwitchPolicy(): EntitySwitchPolicy {
  return policy;
}

export function setEntitySwitchPolicy(next: EntitySwitchPolicy): void {
  policy = next;
  for (const listener of listeners) listener();
}

export function resetEntitySwitchPolicy(): void {
  setEntitySwitchPolicy(DEFAULT_POLICY);
}

export function subscribeEntitySwitchPolicy(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function maySetEntityId(nextId: string): boolean {
  if (!nextId) return true;
  const { canSwitch, lockedEntityId } = policy;
  if (canSwitch) return true;
  if (!lockedEntityId) return true;
  return nextId === lockedEntityId;
}
