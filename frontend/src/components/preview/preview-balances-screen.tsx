"use client";

import { ChevronLeft } from "lucide-react";

import { EntityBalanceSticker } from "@/components/entity-balance-sticker";
import {
  PREVIEW_CUSTOMER_LEDGER,
  PREVIEW_SUPPLIER_ACTIVITY,
} from "@/components/preview/preview-sample-data";
import {
  MobileCardList,
  MobileCardRow,
} from "@/components/ui/mobile-card-list";
import {
  customerBalanceHeading,
  customerBalanceStickerMinor,
} from "@/lib/customer-balance";
import { formatFxNative } from "@/lib/fx-money";
import { supplierBalanceHeading } from "@/lib/supplier-balance";

export function PreviewBalancesScreen({
  onOpenSupplier,
  onOpenCustomer,
}: {
  onOpenSupplier: () => void;
  onOpenCustomer: () => void;
}) {
  return (
    <div className="space-y-4" data-preview-screen="balances">
      <h1 className="text-lg font-semibold">Balances</h1>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Sticker states
      </p>
      <div className="space-y-3">
        <EntityBalanceSticker
          label={supplierBalanceHeading(45_000_00)}
          caption="Current balance"
          signedBalanceMinor={45_000_00}
        />
        <EntityBalanceSticker
          label={supplierBalanceHeading(-12_500_00)}
          caption="Current balance"
          signedBalanceMinor={-12_500_00}
        />
        <EntityBalanceSticker
          label={supplierBalanceHeading(0)}
          caption="Current balance"
          signedBalanceMinor={0}
        />
        <EntityBalanceSticker
          label="Owed in USD"
          caption="FX wallet"
          signedBalanceMinor={324_000}
          format={(minor) => formatFxNative(minor, "USD")}
        />
      </div>

      <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Directories
      </p>
      <MobileCardList>
        <MobileCardRow
          title="Metro Gıda Toptan"
          amount="1.195.278,24 ₺"
          meta={<span className="text-xs text-muted-foreground">Supplier detail</span>}
          onClick={onOpenSupplier}
        />
        <MobileCardRow
          title="Acme Agency"
          amount="3.200,00 ₺"
          meta={<span className="text-xs text-muted-foreground">Customer detail</span>}
          onClick={onOpenCustomer}
        />
      </MobileCardList>
    </div>
  );
}

export function PreviewSupplierDetailScreen({
  onBack,
  onVoid,
}: {
  onBack: () => void;
  onVoid: () => void;
}) {
  return (
    <div className="space-y-4" data-preview-screen="supplier-detail">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary"
        onClick={onBack}
      >
        <ChevronLeft className="size-4" />
        Back
      </button>
      <h1 className="text-lg font-semibold">Metro Gıda Toptan</h1>
      <EntityBalanceSticker
        label={supplierBalanceHeading(1_195_278_24)}
        caption="Current balance"
        signedBalanceMinor={1_195_278_24}
        details={<p>14 posted invoices</p>}
      />
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Activity
      </p>
      <MobileCardList>
        {PREVIEW_SUPPLIER_ACTIVITY.map((row) => (
          <MobileCardRow
            key={row.id}
            title={row.date}
            amount={row.amount}
            meta={<span className="text-xs">{row.type}</span>}
            trailing={
              row.id === "sup-1" ? (
                <button
                  type="button"
                  className="text-xs font-medium text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onVoid();
                  }}
                >
                  Void
                </button>
              ) : undefined
            }
          />
        ))}
      </MobileCardList>
    </div>
  );
}

export function PreviewCustomerDetailScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4" data-preview-screen="customer-detail">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary"
        onClick={onBack}
      >
        <ChevronLeft className="size-4" />
        Back
      </button>
      <h1 className="text-lg font-semibold">Acme Agency</h1>
      <EntityBalanceSticker
        label={customerBalanceHeading(320_000)}
        caption="Current balance"
        signedBalanceMinor={customerBalanceStickerMinor(320_000)}
        details={<p>Owed: {formatFxNative(124_000, "USD")}</p>}
      />
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Ledger
      </p>
      <MobileCardList>
        {PREVIEW_CUSTOMER_LEDGER.map((row) => (
          <MobileCardRow
            key={row.id}
            title={row.description}
            amount={row.amount}
            meta={<span className="text-xs text-muted-foreground">{row.date}</span>}
          />
        ))}
      </MobileCardList>
    </div>
  );
}
