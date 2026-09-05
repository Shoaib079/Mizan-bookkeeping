/** Display helpers for per-account Banking stickers (banks / cards / drawers). */

import { Building2, CreditCard, Wallet, type LucideIcon } from "lucide-react";

import type { IconStroke, IconTint } from "@/components/ui/icon-square";
import type { AccentBarTone } from "@/components/ui/meaning-card";
import type { MoneyAccountKind, MoneyAccountLeaf } from "@/lib/banking-types";
import { formatTry } from "@/lib/money";

const LOOKS: { accent: AccentBarTone; tint: IconTint; stroke: IconStroke }[] = [
  { accent: "blue", tint: "sky", stroke: "blue" },
  { accent: "green", tint: "mint", stroke: "green" },
  { accent: "amber", tint: "sand", stroke: "amber" },
  { accent: "gray", tint: "gray", stroke: "gray" },
];

export function moneyAccountStickerLook(index: number) {
  return LOOKS[index % LOOKS.length]!;
}

export function moneyAccountStickerIcon(
  kind: MoneyAccountKind,
): LucideIcon {
  if (kind === "credit_card") return CreditCard;
  if (kind === "cash") return Wallet;
  return Building2;
}

/** Caption under the account name — last four / bank label + book balance. */
export function moneyAccountStickerSubtitle(
  account: MoneyAccountLeaf,
): string {
  const bits: string[] = [];
  if (account.last_four) bits.push(`···${account.last_four}`);
  if (account.bank_name && account.bank_name !== account.name) {
    bits.push(account.bank_name);
  }
  bits.push("book balance");
  return bits.join(" · ");
}

export function moneyAccountDetailHref(accountId: string): string {
  return `/banking/accounts/${accountId}`;
}

/** Fields HubTileCard needs — keep this free of the client HubPage module. */
export type MoneyAccountHubTileFields = {
  key: string;
  href: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  amount: string;
  accent: AccentBarTone;
  iconTint: IconTint;
  iconStroke: IconStroke;
};

export function moneyAccountsToHubTiles(
  accounts: MoneyAccountLeaf[],
): MoneyAccountHubTileFields[] {
  return accounts.map((account, index) => {
    const look = moneyAccountStickerLook(index);
    return {
      key: account.id,
      href: moneyAccountDetailHref(account.id),
      icon: moneyAccountStickerIcon(account.account_kind),
      title: account.name,
      subtitle: moneyAccountStickerSubtitle(account),
      amount: formatTry(account.balance_kurus),
      accent: look.accent,
      iconTint: look.tint,
      iconStroke: look.stroke,
    };
  });
}
