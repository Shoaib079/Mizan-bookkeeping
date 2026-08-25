"use client";

/** Add-wallet and FX buy/convert/spend dialogs for the FX hub. */

import { FxConversionForm } from "@/components/forms/fx-conversion-form";
import { FxExpenseSpendForm } from "@/components/forms/fx-expense-spend-form";
import { FxPurchaseForm } from "@/components/forms/fx-purchase-form";
import { MoneyAccountForm } from "@/components/forms/money-account-form";
import type { MoneyAccountLeaf } from "@/lib/banking-types";

export type FxHubDialogsProps = {
  addWalletOpen: boolean;
  onAddWalletClose: () => void;
  addWalletCurrency: string;
  actionWallet: MoneyAccountLeaf | null;
  actionCurrency: string;
  purchaseOpen: boolean;
  onPurchaseClose: () => void;
  convertOpen: boolean;
  onConvertClose: () => void;
  spendOpen: boolean;
  onSpendClose: () => void;
  onSaved: () => void;
};

export function FxHubDialogs({
  addWalletOpen,
  onAddWalletClose,
  addWalletCurrency,
  actionWallet,
  actionCurrency,
  purchaseOpen,
  onPurchaseClose,
  convertOpen,
  onConvertClose,
  spendOpen,
  onSpendClose,
  onSaved,
}: FxHubDialogsProps) {
  return (
    <>
      <MoneyAccountForm
        open={addWalletOpen}
        onClose={onAddWalletClose}
        defaultKind="foreign_currency"
        fixedKind="foreign_currency"
        defaultCurrency={addWalletCurrency}
        onSaved={onSaved}
      />
      {actionWallet && (
        <>
          <FxPurchaseForm
            open={purchaseOpen}
            onClose={onPurchaseClose}
            fxAccountId={actionWallet.id}
            currency={actionCurrency}
            onSaved={onSaved}
          />
          <FxConversionForm
            open={convertOpen}
            onClose={onConvertClose}
            fxAccountId={actionWallet.id}
            currency={actionCurrency}
            onSaved={onSaved}
          />
          <FxExpenseSpendForm
            open={spendOpen}
            onClose={onSpendClose}
            fxAccountId={actionWallet.id}
            currency={actionCurrency}
            onSaved={onSaved}
          />
        </>
      )}
    </>
  );
}
