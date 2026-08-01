/** Load all statement lines for the unified review hub. */

import { apiFetch } from "@/lib/api";
import type {
  BankStatementRead,
  MoneyAccountRead,
  NeedsReviewStatementLine,
  StatementLineReview,
} from "@/lib/banking-types";

type Paginated<T> = { items: T[]; total: number };

const RESOLVED_STATUSES = new Set([
  "posted",
  "linked",
  "classified",
  "needs_review",
]);

/** Statement import/list is bank-only — credit cards must not hit that API. */
export function bankAccountsForStatementReview(
  accounts: MoneyAccountRead[],
): MoneyAccountRead[] {
  return accounts.filter((account) => account.account_kind === "bank");
}

export async function loadStatementReviewLines(
  entityId: string,
  options?: { from: string; to: string },
): Promise<StatementLineReview[]> {
  const byId = new Map<string, StatementLineReview>();
  const rangeQuery =
    options != null
      ? `&from=${encodeURIComponent(options.from)}&to=${encodeURIComponent(options.to)}`
      : "";

  const needsReview = await apiFetch<Paginated<NeedsReviewStatementLine>>(
    `/entities/${entityId}/banking/statements/needs-review?limit=100`,
  );
  for (const line of needsReview.items) {
    byId.set(line.id, line);
  }

  const accounts = await apiFetch<Paginated<MoneyAccountRead>>(
    `/entities/${entityId}/banking/accounts?limit=100`,
  );

  for (const account of bankAccountsForStatementReview(accounts.items)) {
    try {
      const statements = await apiFetch<Paginated<BankStatementRead>>(
        `/entities/${entityId}/banking/accounts/${account.id}/statements?limit=50${rangeQuery}`,
      );
      for (const statement of statements.items) {
        for (const line of statement.lines) {
          if (byId.has(line.id)) continue;
          if (
            !RESOLVED_STATUSES.has(line.status) &&
            line.classification_source !== "rule_auto"
          ) {
            continue;
          }
          byId.set(line.id, {
            ...line,
            money_account_id: statement.money_account_id,
            original_filename: statement.original_filename,
          });
        }
      }
    } catch {
      // Keep needs-review rows already loaded; one bad account must not blank the hub.
      continue;
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    const dateCmp = b.transaction_date.localeCompare(a.transaction_date);
    if (dateCmp !== 0) return dateCmp;
    return a.id.localeCompare(b.id);
  });
}
