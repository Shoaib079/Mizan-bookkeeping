"use client";

import { FxHubActions } from "@/components/banking/fx-hub-actions";
import { FxHubDialogs } from "@/components/banking/fx-hub-dialogs";
import { FxHubLedger } from "@/components/banking/fx-hub-ledger";
import { FxHubWalletChips } from "@/components/banking/fx-hub-wallet-chips";
import { useFxHubPage } from "@/components/banking/use-fx-hub-page";
import { PageHeader } from "@/components/page/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";

export function FxHubPageContent() {
  const hub = useFxHubPage();

  return (
    <>
      <PageHeader title="Foreign currency" />

      {!hub.entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}
      {hub.error && (
        <p className="mb-4 text-sm text-destructive">{hub.error}</p>
      )}
      <PageSkeleton when={hub.loading} />

      {hub.tree && (
        <>
          <FxHubWalletChips
            allWallets={hub.allWallets}
            currencyCounts={hub.currencyCounts}
            walletFilter={hub.walletFilter}
            onWalletFilter={hub.setWalletFilter}
            missingCurrencies={hub.missingCurrencies}
            deactivatingId={hub.deactivatingId}
            onDeactivate={hub.onDeactivate}
            onOpenAddWallet={hub.openAddWallet}
          />
          <FxHubActions
            actionWallet={hub.actionWallet}
            onBuy={() => hub.setPurchaseOpen(true)}
            onConvert={() => hub.setConvertOpen(true)}
            onSpend={() => hub.setSpendOpen(true)}
          />
          <FxHubLedger
            from={hub.from}
            to={hub.to}
            onRangeChange={hub.setRange}
            ledgerLoading={hub.ledgerLoading}
            walletCount={hub.allWallets.length}
            mergedLedger={hub.mergedLedger}
          />
        </>
      )}

      <FxHubDialogs
        addWalletOpen={hub.addWalletOpen}
        onAddWalletClose={() => hub.setAddWalletOpen(false)}
        addWalletCurrency={hub.addWalletCurrency}
        actionWallet={hub.actionWallet}
        actionCurrency={hub.actionCurrency}
        purchaseOpen={hub.purchaseOpen}
        onPurchaseClose={() => hub.setPurchaseOpen(false)}
        convertOpen={hub.convertOpen}
        onConvertClose={() => hub.setConvertOpen(false)}
        spendOpen={hub.spendOpen}
        onSpendClose={() => hub.setSpendOpen(false)}
        onSaved={hub.onReload}
      />
    </>
  );
}
