/** Types + display helpers for the customer detail ledger. */

import type { ForexOutstanding } from "@/lib/use-balance-map";
import { formatFxNative } from "@/lib/fx-money";
import { formatTry } from "@/lib/money";
import type { SubledgerDisplayKind } from "@/lib/ledger-display";

export type CustomerLedgerEntry = {
  id: string;
  movement_date: string;
  movement_type: string;
  amount_kurus: number;
  description: string;
  pax: number | null;
  rate_per_person_kurus: number | null;
  forex_currency: string | null;
  rate_per_person_forex_minor: number | null;
  total_forex_minor: number | null;
  payment_native_quantity: number | null;
  reference_type: string | null;
  reference_id: string | null;
  journal_entry_id: string | null;
  payment_account_id: string | null;
  display_kind: SubledgerDisplayKind;
  was_corrected?: boolean;
  /** Same running total the export reads — from get_customer_ledger. */
  running_balance_kurus?: number | null;
};

export type CustomerLedgerResponse = {
  balance_kurus: number;
  /** One line per currency still owed. Empty when only ever billed in lira. */
  outstanding_by_currency?: ForexOutstanding[];
  entries: CustomerLedgerEntry[];
};

export function formatLedgerGroupMeta(
  entry: CustomerLedgerEntry,
): string | null {
  const parts: string[] = [];
  if (entry.pax != null) {
    if (entry.rate_per_person_kurus != null) {
      parts.push(
        `${entry.pax} pax × ${formatTry(entry.rate_per_person_kurus)}`,
      );
    } else {
      parts.push(`${entry.pax} pax`);
    }
  }
  if (
    entry.forex_currency &&
    entry.rate_per_person_forex_minor != null &&
    entry.pax != null
  ) {
    parts.push(
      `${formatFxNative(entry.rate_per_person_forex_minor, entry.forex_currency)}/pax`,
    );
  }
  if (entry.forex_currency && entry.total_forex_minor != null) {
    parts.push(formatFxNative(entry.total_forex_minor, entry.forex_currency));
  }
  if (entry.forex_currency && entry.payment_native_quantity != null) {
    parts.push(
      `${formatFxNative(entry.payment_native_quantity, entry.forex_currency)} received`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
