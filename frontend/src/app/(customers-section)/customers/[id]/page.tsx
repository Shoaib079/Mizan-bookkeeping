"use client";

/** Customer detail — DESIGN_ARCHETYPES §2 (`EntityDetailPage`). */

import { CustomerDetailDialogs } from "@/components/customers/customer-detail-dialogs";
import { CustomerDetailLedger } from "@/components/customers/customer-detail-ledger";
import { customerDetailWriteChrome } from "@/components/customers/customer-detail-write-chrome";
import { useCustomerDetailPage } from "@/components/customers/use-customer-detail-page";
import { EntityBalanceSticker } from "@/components/entity-balance-sticker";
import { EntityDetailPage } from "@/components/page/entity-detail-page";
import { MetaFacts } from "@/components/page/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  customerBalanceHeading,
  customerBalanceStickerMinor,
} from "@/lib/customer-balance";
import { formatForexBalanceSummary } from "@/lib/fx-money";
import { useWriteChrome } from "@/lib/use-write-chrome";

export default function CustomerDetailPage() {
  const { showWrite } = useWriteChrome();
  const page = useCustomerDetailPage();

  if (!page.entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  const forexSummary = formatForexBalanceSummary(
    page.ledger?.outstanding_by_currency,
  );

  return (
    <EntityDetailPage
      title={page.customer?.name ?? "Customer"}
      loading={page.loading}
      error={page.error}
      meta={
        page.customer && (
          <MetaFacts
            items={[
              <StatusBadge
                key="status"
                status={page.customer.is_active ? "active" : "inactive"}
              />,
              page.customer.tax_id && `VKN/TCKN ${page.customer.tax_id}`,
              page.customer.contact_name,
              page.customer.phone,
              page.customer.identifier && `ID ${page.customer.identifier}`,
              page.customer.notes,
            ].filter(Boolean)}
          />
        )
      }
      {...customerDetailWriteChrome({
        showWrite,
        entityId: page.entityId,
        customerId: page.customerId,
        balanceKurus: page.ledger?.balance_kurus ?? 0,
        onPayment: () => page.setPaymentOpen(true),
        onSale: () => page.setSaleOpen(true),
        onEdit: () => page.setEditOpen(true),
        onWriteOff: () => page.setWriteOffOpen(true),
      })}
      balance={
        page.ledger && (
          <EntityBalanceSticker
            label={customerBalanceHeading(page.ledger.balance_kurus)}
            caption="Current balance"
            signedBalanceMinor={customerBalanceStickerMinor(
              page.ledger.balance_kurus,
            )}
            details={forexSummary ? <p>{forexSummary}</p> : undefined}
          />
        )
      }
      activity={
        page.ledger && (
          <CustomerDetailLedger
            entries={page.ledger.entries}
            visibleRows={page.visibleRows}
            hiddenCount={page.hiddenCount}
            showHistory={page.showHistory}
            onToggleHistory={page.setShowHistory}
            onEdit={page.openEdit}
            onVoid={page.setVoidTarget}
          />
        )
      }
    >
      {page.customer && (
        <CustomerDetailDialogs
          entityId={page.entityId}
          customerId={page.customerId}
          customer={page.customer}
          balanceKurus={page.ledger?.balance_kurus}
          outstandingByCurrency={page.ledger?.outstanding_by_currency}
          editOpen={page.editOpen}
          onEditClose={() => page.setEditOpen(false)}
          saleOpen={page.saleOpen}
          onSaleClose={() => page.setSaleOpen(false)}
          paymentOpen={page.paymentOpen}
          onPaymentClose={() => page.setPaymentOpen(false)}
          writeOffOpen={page.writeOffOpen}
          correctWriteOff={page.correctWriteOff}
          onWriteOffClose={() => {
            page.setWriteOffOpen(false);
            page.setCorrectWriteOff(null);
          }}
          correctPayment={page.correctPayment}
          onCorrectPaymentClose={() => page.setCorrectPayment(null)}
          correctCreditSale={page.correctCreditSale}
          onCorrectCreditSaleClose={() => page.setCorrectCreditSale(null)}
          groupSaleEditId={page.groupSaleEditId}
          onGroupSaleEditClose={() => page.setGroupSaleEditId(null)}
          voidTarget={page.voidTarget}
          onVoidClose={() => page.setVoidTarget(null)}
          onSaved={() => void page.reload()}
        />
      )}
    </EntityDetailPage>
  );
}
