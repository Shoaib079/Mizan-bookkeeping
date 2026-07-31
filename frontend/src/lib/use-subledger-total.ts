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
 * Staff: TRY and FX are both shown — FX as native currency, never converted
 * into the cash ₺ total (2026-07-31).
 */

import { useMemo } from "react";

import { formatFxNative } from "@/lib/fx-money";
import { formatTry } from "@/lib/money";
import {
  formatStaffHubAmount,
  fxStaffCount,
  staffHubNetSign,
  sumFxStaffBalancesByCurrency,
  sumTryStaffBalances,
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
  /** FX-paid employees (balances shown in native currency on amountLabel). */
  fxCount: number;
  /** Display string: TRY and/or native FX amounts. */
  amountLabel: string;
  /** Sign for colouring — positive = owed to staff. */
  netSign: number;
  /** True when employees exist but every ledger fetch failed. */
  loadFailed: boolean;
};

function extractStaffBalanceMinor(res: unknown): number {
  const raw = (res as { balance_minor?: unknown }).balance_minor;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error("staff ledger missing balance_minor");
  }
  return n;
}

/** Net across employees: TRY in ₺, FX in native — never mixed into one ₺ figure. */
export function useStaffBalanceTotal(entityId: string | null): StaffSubledgerTotal {
  // useEntityList wants a string; an empty id keeps it idle until one arrives.
  const { items, loading: listLoading } = useEntityList<StaffPayCurrencyRow>(
    // Inactive employees can still carry a balance — leaving them out would
    // understate what's owed.
    // API max list limit is 200 (MAX_LIST_LIMIT); 500 returned 422 and the
    // card showed "0 employees" with a fake ₺0 total.
    "/staff/employees?include_inactive=true&limit=200",
    entityId ?? "",
  );
  // Fetch every employee's ledger (TRY and FX) — filtering to TRY-only hid FX
  // wages and looked like ₺0 when the restaurant pays staff in forex.
  const ids = useMemo(() => items.map((row) => row.id), [items]);
  const { balances, loading: balancesLoading } = useLedgerBalanceMap(
    entityId,
    ids,
    (id) => `/staff/employees/${id}/ledger`,
    extractStaffBalanceMinor,
  );

  const totalKurus = useMemo(
    () => sumTryStaffBalances(items, balances),
    [items, balances],
  );
  const fxByCurrency = useMemo(
    () => sumFxStaffBalancesByCurrency(items, balances),
    [items, balances],
  );
  const amountLabel = useMemo(
    () =>
      formatStaffHubAmount(totalKurus, fxByCurrency, formatTry, formatFxNative),
    [totalKurus, fxByCurrency],
  );
  const netSign = useMemo(
    () => staffHubNetSign(totalKurus, fxByCurrency),
    [totalKurus, fxByCurrency],
  );
  const loading = listLoading || balancesLoading;
  const loadFailed =
    !loading && items.length > 0 && balances.size === 0;

  return {
    totalKurus,
    amountLabel: loadFailed ? "—" : amountLabel,
    netSign,
    count: items.length,
    fxCount: fxStaffCount(items),
    loading,
    loadFailed,
  };
}

export function usePartnerBalanceTotal(entityId: string | null): SubledgerTotal {
  const { items, loading: listLoading } = useEntityList<Row>(
    "/partners?limit=200",
    entityId ?? "",
  );
  const ids = useMemo(() => items.map((row) => row.id), [items]);
  const { balances, loading: balancesLoading } = useLedgerBalanceMap(
    entityId,
    ids,
    (id) => `/partners/${id}/ledger`,
    (res) => {
      const raw = (res as { balance_kurus?: unknown }).balance_kurus;
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) throw new Error("partner ledger missing balance_kurus");
      return n;
    },
  );

  const totalKurus = useMemo(() => sumBalances(balances), [balances]);

  return {
    totalKurus,
    count: ids.length,
    loading: listLoading || balancesLoading,
  };
}
