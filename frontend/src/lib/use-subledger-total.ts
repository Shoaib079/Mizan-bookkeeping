"use client";

/** Grand totals for the Staff and Partner cards on the Balances hub.
 *
 * Both cards used to show nothing at all — just a link through to the
 * directory, so the hub couldn't answer "what do I owe my staff" without a
 * click (2026-07-29).
 *
 * These deliberately sum **the same per-person balances the directories
 * display**, rather than reading the GL control accounts. The control accounts
 * would be one query instead of N and are guaranteed to tie — but if a tie ever
 * broke, the card and the page it links to would disagree and there'd be no way
 * to tell which was right. Summing the same source can't drift by construction.
 *
 * The N+1 is affordable here: a restaurant has a handful of staff and two or
 * three partners, and the directories already fan out exactly these calls.
 *
 * Staff totals are TRY-only — FX `balance_minor` is in foreign cents and must
 * not be mixed into a ₺ figure (Balances hub fix 2026-07-31).
 */

import { useMemo } from "react";

import {
  fxStaffCount,
  sumTryStaffBalances,
  tryStaffIds,
  type StaffPayCurrencyRow,
} from "@/lib/staff-balance-total";
import { sumBalances } from "@/lib/subledger-total";
import { useEntityList } from "@/lib/use-entity-list";
import { useLedgerBalanceMap } from "@/lib/use-ledger-balance-map";

type Row = { id: string };

export type SubledgerTotal = {
  totalKurus: number;
  /** How many people the total covers — lets the card say "across 7 staff". */
  count: number;
  loading: boolean;
};

export type StaffSubledgerTotal = SubledgerTotal & {
  /** FX-paid employees excluded from totalKurus (see directory for their balances). */
  fxCount: number;
};

/** Net across TRY-paid employees: positive = owed to staff, negative = advances held. */
export function useStaffBalanceTotal(entityId: string | null): StaffSubledgerTotal {
  // useEntityList wants a string; an empty id keeps it idle until one arrives.
  const { items, loading: listLoading } = useEntityList<StaffPayCurrencyRow>(
    // Inactive employees can still carry a balance — leaving them out would
    // understate what's owed.
    "/staff/employees?include_inactive=true&limit=500",
    entityId ?? "",
  );
  const tryIds = useMemo(() => tryStaffIds(items), [items]);
  const { balances, loading: balancesLoading } = useLedgerBalanceMap(
    entityId,
    tryIds,
    (id) => `/staff/employees/${id}/ledger`,
    (res) => (res as { balance_minor: number }).balance_minor,
  );

  const totalKurus = useMemo(
    () => sumTryStaffBalances(items, balances),
    [items, balances],
  );

  return {
    totalKurus,
    count: items.length,
    fxCount: fxStaffCount(items),
    loading: listLoading || balancesLoading,
  };
}

export function usePartnerBalanceTotal(entityId: string | null): SubledgerTotal {
  const { items, loading: listLoading } = useEntityList<Row>(
    "/partners?limit=500",
    entityId ?? "",
  );
  const ids = useMemo(() => items.map((row) => row.id), [items]);
  const { balances, loading: balancesLoading } = useLedgerBalanceMap(
    entityId,
    ids,
    (id) => `/partners/${id}/ledger`,
    (res) => (res as { balance_kurus: number }).balance_kurus,
  );

  const totalKurus = useMemo(() => sumBalances(balances), [balances]);

  return {
    totalKurus,
    count: ids.length,
    loading: listLoading || balancesLoading,
  };
}
