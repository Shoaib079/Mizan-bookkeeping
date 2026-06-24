"use client";

import { ChevronDown, Plus, Receipt, ShoppingBag, Wallet } from "lucide-react";
import { useState } from "react";

import { ExpenseReceiptUploadForm } from "@/components/forms/expense-receipt-upload-form";
import { ManualDailySalesForm } from "@/components/forms/manual-daily-sales-form";
import { ManualExpenseForm } from "@/components/forms/manual-expense-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MenuKey = "expense" | "sales" | "receipt" | null;

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
            onClick={() => openForm("sales")}
          >
            <ShoppingBag className="size-4 text-primary" />
            Daily sales (manual)
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sidebar-accent"
            onClick={() => openForm("receipt")}
          >
            <Receipt className="size-4 text-primary" />
            Expense receipt (photo)
          </button>
        </div>
      )}

      <ManualExpenseForm open={active === "expense"} onClose={() => setActive(null)} />
      <ManualDailySalesForm open={active === "sales"} onClose={() => setActive(null)} />
      <ExpenseReceiptUploadForm
        open={active === "receipt"}
        onClose={() => setActive(null)}
      />
    </div>
  );
}
