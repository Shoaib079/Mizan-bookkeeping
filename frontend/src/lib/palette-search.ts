/** Palette search helpers — suppliers, customers + expense items via existing API (UX-B, audit A6). */

import { apiFetch } from "@/lib/api";

export const PALETTE_SEARCH_DEBOUNCE_MS = 250;
export const PALETTE_SEARCH_MIN_CHARS = 2;
const SEARCH_LIMIT = 6;

export type PaletteSupplier = {
  id: string;
  name: string;
  vkn: string | null;
};

export type PaletteExpenseItem = {
  id: string;
  canonical_name: string;
};

export type PaletteCustomer = {
  id: string;
  name: string;
  identifier: string | null;
};

type PaginatedList<T> = { items: T[]; total: number };

let searchGeneration = 0;

/**
 * Fetch suppliers matching query. Returns empty on stale entity or generation mismatch.
 * Caller should increment generation on each keystroke / entity change.
 */
export function nextSearchGeneration(): number {
  searchGeneration += 1;
  return searchGeneration;
}

export function isStale(gen: number): boolean {
  return gen !== searchGeneration;
}

export async function searchSuppliers(
  entityId: string,
  query: string,
  gen: number,
): Promise<PaletteSupplier[]> {
  const q = query.trim();
  if (q.length < PALETTE_SEARCH_MIN_CHARS) return [];
  const res = await apiFetch<PaginatedList<PaletteSupplier>>(
    `/entities/${entityId}/suppliers?q=${encodeURIComponent(q)}&limit=${SEARCH_LIMIT}`,
  );
  if (isStale(gen)) return [];
  return res.items;
}

export async function searchCustomers(
  entityId: string,
  query: string,
  gen: number,
): Promise<PaletteCustomer[]> {
  const q = query.trim();
  if (q.length < PALETTE_SEARCH_MIN_CHARS) return [];
  const res = await apiFetch<PaginatedList<PaletteCustomer>>(
    `/entities/${entityId}/customers?q=${encodeURIComponent(q)}&limit=${SEARCH_LIMIT}`,
  );
  if (isStale(gen)) return [];
  return res.items;
}

export async function searchExpenseItems(
  entityId: string,
  query: string,
  gen: number,
): Promise<PaletteExpenseItem[]> {
  const q = query.trim();
  if (q.length < PALETTE_SEARCH_MIN_CHARS) return [];
  const res = await apiFetch<PaginatedList<PaletteExpenseItem>>(
    `/entities/${entityId}/expense-items?q=${encodeURIComponent(q)}&limit=${SEARCH_LIMIT}`,
  );
  if (isStale(gen)) return [];
  return res.items;
}
