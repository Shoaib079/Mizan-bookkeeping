import type { FxLedgerEntryRead, MoneyAccountLeaf, MoneyAccountTree } from "@/lib/banking-types";
import { formatFxNative } from "@/lib/fx-money";
import { formatTry } from "@/lib/money";

export type FxLedgerRowWithWallet = FxLedgerEntryRead & {
  wallet_name: string;
  wallet_currency: string;
};

export function allFxAccounts(tree: MoneyAccountTree): MoneyAccountLeaf[] {
  return [
    ...tree.foreign_currency.usd.accounts,
    ...tree.foreign_currency.eur.accounts,
    ...tree.foreign_currency.gbp.accounts,
  ].filter((account) => account.is_active);
}

export function formatFxTileSummary(accounts: MoneyAccountLeaf[]): string {
  const parts = accounts
    .filter(
      (account) =>
        account.native_quantity !== null && account.native_quantity !== 0,
    )
    .map((account) =>
      formatFxNative(account.native_quantity!, account.currency ?? "USD"),
    );
  if (parts.length === 0) return "No holdings";
  return parts.join(" · ");
}

export function accountCountLabel(
  count: number,
  singular: string,
  plural?: string,
): string {
  const word = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${count} ${word}`;
}

export function accountSubtitle(accounts: MoneyAccountLeaf[], max = 2): string {
  if (accounts.length === 0) return "None yet";
  const names = accounts.slice(0, max).map((account) => {
    if (account.last_four) return `${account.name} ···${account.last_four}`;
    return account.name;
  });
  const extra = accounts.length > max ? ` +${accounts.length - max}` : "";
  return names.join(", ") + extra;
}

export function formatTryTileBalance(kurus: number): string {
  return formatTry(kurus);
}

export function mergeFxLedgerEntries(
  wallets: MoneyAccountLeaf[],
  entriesByWallet: Map<string, FxLedgerEntryRead[]>,
): FxLedgerRowWithWallet[] {
  const rows: FxLedgerRowWithWallet[] = [];
  for (const wallet of wallets) {
    const entries = entriesByWallet.get(wallet.id) ?? [];
    for (const entry of entries) {
      rows.push({
        ...entry,
        wallet_name: wallet.name,
        wallet_currency: wallet.currency ?? "USD",
      });
    }
  }
  return rows.sort((a, b) => {
    const byDate = b.movement_date.localeCompare(a.movement_date);
    if (byDate !== 0) return byDate;
    return b.created_at.localeCompare(a.created_at);
  });
}

export function canDeactivateFxWallet(account: MoneyAccountLeaf): boolean {
  const native = account.native_quantity ?? 0;
  return native === 0 && account.balance_kurus === 0;
}
