"use client";

import Link from "next/link";

import { SplitExpenseList } from "@/components/split/split-expense-list";
import { SplitHubDialog } from "@/components/split/split-hub-dialog";
import { SplitHubToolbar } from "@/components/split/split-hub-toolbar";
import { SplitPaymentList } from "@/components/split/split-payment-list";
import { useSplitHubPage } from "@/components/split/use-split-hub-page";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page/page-header";

export default function SplitHubPage() {
  const s = useSplitHubPage();

  if (!s.entityId) {
    return (
      <AppShell title="Split">
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Split">
      <PageHeader
        title="Split"
        meta={
          <>
            Peel a personal share onto a partner from a posted bank expense
            (SGK, rent…) or a supplier payment. Restaurant share stays on the
            books; bank is unchanged. Partner paid from pocket with no bank
            payment yet?{" "}
            <Link href="/partners" className="underline underline-offset-2">
              Partners → Split buy
            </Link>
            .
          </>
        }
      />

      {s.error && <p className="mb-4 text-sm text-destructive">{s.error}</p>}

      <SplitHubToolbar
        tab={s.tab}
        onTabChange={s.setTab}
        search={s.search}
        onSearchChange={s.setSearch}
      />

      {s.loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : s.tab === "bank_expense" ? (
        <SplitExpenseList expenses={s.expenses} onSelect={s.openExpense} />
      ) : (
        <SplitPaymentList payments={s.payments} onSelect={s.openPayment} />
      )}

      <SplitHubDialog
        selected={s.selected}
        title={s.dialogTitle}
        onClose={s.closeDialog}
        selectedExpense={s.selectedExpense}
        selectedPayment={s.selectedPayment}
        remaining={s.remaining}
        restaurantKurus={s.restaurantKurus}
        partners={s.partners}
        partnerId={s.partnerId}
        onPartnerIdChange={s.setPartnerId}
        personalText={s.personalText}
        onPersonalTextChange={s.setPersonalText}
        expenseAccounts={s.expenseAccounts}
        expenseAccountId={s.expenseAccountId}
        onExpenseAccountIdChange={s.setExpenseAccountId}
        note={s.note}
        onNoteChange={s.setNote}
        formError={s.formError}
        submitting={s.submitting}
        onSubmit={s.onSubmit}
      />
    </AppShell>
  );
}
