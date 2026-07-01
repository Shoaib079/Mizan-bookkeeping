/** Pure helpers for entity list / empty-state UI (testable without React). */

type EntityListItem = { id: string };

export function shouldShowCreateRestaurantPrompt(params: {
  entitiesLoading: boolean;
  entitiesLoaded: boolean;
  entitiesError: boolean;
  entityCount: number;
}): boolean {
  return (
    !params.entitiesLoading &&
    !params.entitiesError &&
    params.entitiesLoaded &&
    params.entityCount === 0
  );
}

export const ENTITY_FETCH_MAX_ATTEMPTS = 3;
export const ENTITY_FETCH_RETRY_DELAY_MS = 600;

export async function fetchEntitiesWithRetry(
  fetchOnce: () => Promise<{ items: { id: string; name: string }[] }>,
  options?: {
    maxAttempts?: number;
    delayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<{ items: { id: string; name: string }[] }> {
  const maxAttempts = options?.maxAttempts ?? ENTITY_FETCH_MAX_ATTEMPTS;
  const delayMs = options?.delayMs ?? ENTITY_FETCH_RETRY_DELAY_MS;
  const sleep =
    options?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchOnce();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}

/** Resolve active entity after list fetch — avoid spurious context churn. */
export function resolveEntityIdFromList(
  currentEntityId: string,
  items: EntityListItem[],
  storedEntityId: string | null,
): string {
  const storedMatch = storedEntityId
    ? items.find((entity) => entity.id === storedEntityId)
    : undefined;
  if (storedMatch) {
    return storedMatch.id === currentEntityId ? currentEntityId : storedMatch.id;
  }
  if (items.length > 0 && !items.some((entity) => entity.id === currentEntityId)) {
    return items[0].id;
  }
  return currentEntityId;
}
