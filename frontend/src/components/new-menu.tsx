"use client";

import {
  ChevronDown,
  CreditCard,
  FileText,
  Plus,
  Receipt,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";

import { EfaturaUploadForm } from "@/components/forms/efatura-upload-form";
import { CardSalesForm } from "@/components/forms/card-sales-form";
import { DeliveryReportForm } from "@/components/forms/delivery-report-form";
import { ExpenseReceiptUploadForm } from "@/components/forms/expense-receipt-upload-form";
import { ManualDailySalesForm } from "@/components/forms/manual-daily-sales-form";
import { ManualExpenseForm } from "@/components/forms/manual-expense-form";
import { PosSummaryUploadForm } from "@/components/forms/pos-summary-upload-form";
import { SupplierForm } from "@/components/forms/supplier-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MenuKey =
  | "expense"
  | "cashTip"
  | "sales"
  | "posPhoto"
  | "cardSales"
  | "deliveryReport"
  | "receipt"
  | "supplier"
  | "efatura"
  | null;

export function NewMenu() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<MenuKey>(null);

  function openForm(key: MenuKey) {
    setOpen(false);
    setActive(key);
  }

  return (
    <div className="relative px-3 pb-3">
      <Button
        className="w-full justify-between"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="inline-flex items-center gap-2">
          <Plus className="size-4" />
          New
        </span>
        <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
      </Button>
      {open && (
        <div className="absolute left-3 right-3 top-full z-20 mt-1 rounded-md border border-border bg-card py-1 shadow-md">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sidebar-accent"
            onClick={() => openForm("expense")}
          >
            <Wallet className="size-4 text-primary" />
            Manual expense
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sidebar-accent"
            onClick={() => openForm("cashTip")}
          >
            <Wallet className="size-4 text-primary" />
            Cash tip (5700 expense)
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sidebar-accent"
            onClick={() => openForm("sales")}
          >
            <ShoppingBag className="size-4 text-primary" />
            Daily sales (manual)
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sidebar-accent"
            onClick={() => openForm("posPhoto")}
          >
            <ShoppingBag className="size-4 text-primary" />
            POS summary (photo)
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sidebar-accent"
            onClick={() => openForm("cardSales")}
          >
            <CreditCard className="size-4 text-primary" />
            Card sales batch
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sidebar-accent"
            onClick={() => openForm("deliveryReport")}
          >
            <Truck className="size-4 text-primary" />
            Delivery report
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sidebar-accent"
            onClick={() => openForm("receipt")}
          >
            <Receipt className="size-4 text-primary" />
            Expense receipt (photo)
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sidebar-accent"
            onClick={() => openForm("supplier")}
          >
            <Users className="size-4 text-primary" />
            Supplier
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sidebar-accent"
            onClick={() => openForm("efatura")}
          >
            <FileText className="size-4 text-primary" />
            Supplier invoice (e-Fatura)
          </button>
        </div>
      )}

      <ManualExpenseForm open={active === "expense"} onClose={() => setActive(null)} />
      <ManualExpenseForm
        open={active === "cashTip"}
        onClose={() => setActive(null)}
        defaultExpenseAccountCode="5700"
      />
      <ManualDailySalesForm open={active === "sales"} onClose={() => setActive(null)} />
      <PosSummaryUploadForm open={active === "posPhoto"} onClose={() => setActive(null)} />
      <CardSalesForm open={active === "cardSales"} onClose={() => setActive(null)} />
      <DeliveryReportForm open={active === "deliveryReport"} onClose={() => setActive(null)} />
      <ExpenseReceiptUploadForm
        open={active === "receipt"}
        onClose={() => setActive(null)}
      />
      <SupplierForm open={active === "supplier"} onClose={() => setActive(null)} />
      <EfaturaUploadForm open={active === "efatura"} onClose={() => setActive(null)} />
    </div>
  );
}
