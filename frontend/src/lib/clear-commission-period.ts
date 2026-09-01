/** Card sales totals for the Clear commission form — period-scoped, not all-time. */

import { apiFetch } from "@/lib/api";
import { calendarMonthContaining } from "@/lib/date-range";
import { parseTrDate } from "@/lib/money";
import type { CardSalesBatch } from "@/lib/pos-delivery-types";

const PAGE_SIZE = 100;

export function commissionPeriodRangeFromTrDate(
  display: string,
): { from: string; to: string } | null {
  const iso = parseTrDate(display.trim());
  if (!iso) return null;
  return calendarMonthContaining(iso);
}

export function sumCardSalesBatchKurus(
  items: Pick<CardSalesBatch, "gross_amount_kurus" | "status">[],
): number {
  return items
    .filter((batch) => batch.status !== "voided")
    .reduce((sum, batch) => sum + batch.gross_amount_kurus, 0);
}

export function buildPeriodCardSalesPath(
  entityId: string,
  from: string,
  to: string,
  offset: number,
): string {
  const params = new URLSearchParams({
    from,
    to,
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  return `/entities/${entityId}/pos/card-sales?${params}`;
}

export async function fetchPeriodCardSalesKurus(
  entityId: string,
  from: string,
  to: string,
  fetcher: typeof apiFetch = apiFetch,
): Promise<number> {
  let offset = 0;
  let total = 0;
  let sum = 0;
  do {
    const response = await fetcher<{ items: CardSalesBatch[]; total: number }>(
      buildPeriodCardSalesPath(entityId, from, to, offset),
    );
    sum += sumCardSalesBatchKurus(response.items);
    total = response.total;
    offset += PAGE_SIZE;
  } while (offset < total);
  return sum;
}
