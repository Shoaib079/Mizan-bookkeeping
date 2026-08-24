/** Opening-balances draft helpers (payload, hints, empty check). */

import { parseTryToKurus } from "@/lib/money";
import type { OpeningBalanceLineDraft } from "@/lib/settings-types";

export type OpeningBalancesDraft = {
  goLiveDate: string;
  lines: OpeningBalanceLineDraft[];
};

export type NamedRow = { id: string; name: string };

/** Just enough of a chart account to label a preview row. */
export type ChartAccountName = {
  code: string;
  name_en?: string;
  name_tr?: string;
};

export function newOpeningBalanceLine(): OpeningBalanceLineDraft {
  return {
    id: crypto.randomUUID(),
    target: "account",
    accountCode: "",
    side: "",
    moneyAccountId: "",
    supplierId: "",
    partnerId: "",
    customerId: "",
    amountTry: "",
  };
}

export function isOpeningBalancesDraftEmpty(
  draft: OpeningBalancesDraft,
): boolean {
  if (draft.goLiveDate.trim()) return false;
  if (draft.lines.length !== 1) return false;
  const line = draft.lines[0];
  return (
    !line.amountTry.trim() &&
    !line.accountCode &&
    !line.moneyAccountId &&
    !line.supplierId &&
    !line.partnerId &&
    !line.customerId
  );
}

export function openingBalanceLineToPayload(line: OpeningBalanceLineDraft) {
  const amount_kurus = parseTryToKurus(line.amountTry);
  if (amount_kurus === null || amount_kurus <= 0) {
    throw new Error("Each line needs a valid amount.");
  }
  switch (line.target) {
    case "account":
      if (!line.accountCode || !line.side) {
        throw new Error("Account lines need code and debit/credit side.");
      }
      return {
        account_code: line.accountCode,
        side: line.side,
        amount_kurus,
      };
    case "money_account":
      if (!line.moneyAccountId) throw new Error("Pick a bank or cash account.");
      return { money_account_id: line.moneyAccountId, amount_kurus };
    case "supplier":
      if (!line.supplierId) throw new Error("Pick a supplier.");
      return { supplier_id: line.supplierId, amount_kurus };
    case "partner":
      if (!line.partnerId) throw new Error("Pick a partner.");
      return { partner_id: line.partnerId, amount_kurus };
    case "customer":
      if (!line.customerId) throw new Error("Pick a customer.");
      return { customer_id: line.customerId, amount_kurus };
    default:
      throw new Error("Unknown line type.");
  }
}

export function openingBalanceLineHint(
  line: OpeningBalanceLineDraft,
): string | null {
  if (!line.amountTry.trim()) {
    return "Enter an amount.";
  }
  const amountKurus = parseTryToKurus(line.amountTry);
  if (amountKurus === null || amountKurus <= 0) {
    return "Amount must be greater than zero.";
  }
  switch (line.target) {
    case "account":
      if (!line.accountCode) return "Pick an account.";
      if (!line.side) return "Pick debit or credit.";
      break;
    case "money_account":
      if (!line.moneyAccountId) return "Pick a bank or cash account.";
      break;
    case "supplier":
      if (!line.supplierId) return "Pick a supplier.";
      break;
    case "partner":
      if (!line.partnerId) return "Pick a partner.";
      break;
    case "customer":
      if (!line.customerId) return "Pick a customer.";
      break;
  }
  return null;
}

export function openingBalanceSideTotal(
  lines: OpeningBalanceLineDraft[],
  side: "debit" | "credit",
): number {
  return lines.reduce((sum, line) => {
    if (line.target !== "account" || line.side !== side) return sum;
    const k = parseTryToKurus(line.amountTry);
    return k !== null && k > 0 ? sum + k : sum;
  }, 0);
}
