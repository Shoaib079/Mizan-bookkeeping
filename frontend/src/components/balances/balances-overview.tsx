"use client";

/** Balances overview (audit M4) — the single Balances door. Directories carry
 * the per-entity detail; this hub shows the grand totals and cash position and
 * links straight to the directory that owns each number. */

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import {
  ArrowRight,
  Banknote,
  HandCoins,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";

import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import {
  useCustomerBalances,
  useSupplierBalances,
} from "@/lib/use-balance-map";
import { subledgerCountLabel } from "@/lib/subledger-total";
import {
  usePartnerBalanceTotal,
  useStaffBalanceTotal,
} from "@/lib/use-subledger-total";
import { cn } from "@/lib/utils";

type CardProps = {
  href: string;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  amount?: string;
  amountClass?: string;
  loading?: boolean;
};

function BalanceCard({
  href,
  title,
  hint,
  icon: Icon,
  amount,
  amountClass,
  loading,
}: CardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/50"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      {amount !== undefined && (
        <div className={cn("mb-1 text-2xl font-semibold tabular-nums", amountClass)}>
          {loading ? "…" : amount}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </Link>
  );
}

export function BalancesOverview() {
  const { entityId } = useEntity();
  const payables = useSupplierBalances(entityId ?? "");
  const receivables = useCustomerBalances(entityId ?? "");
  const staff = useStaffBalanceTotal(entityId);
  const partners = usePartnerBalanceTotal(entityId);

  // Money actually held, across every bank, cash drawer and FX wallet.
  const [cashAndBankKurus, setCashAndBankKurus] = useState(0);
  const [moneyLoading, setMoneyLoading] = useState(false);

  useEffect(() => {
    if (!entityId) {
      setCashAndBankKurus(0);
      return;
    }
    let cancelled = false;
    setMoneyLoading(true);
    void apiFetch<{ items: { balance_kurus: number; is_active: boolean }[] }>(
      `/entities/${entityId}/banking/accounts?limit=100`,
    )
      .then((res) => {
        if (cancelled) return;
        setCashAndBankKurus(
          res.items
            .filter((a) => a.is_active)
            .reduce((sum, a) => sum + (a.balance_kurus ?? 0), 0),
        );
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setMoneyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar to see balances.
      </p>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Grand totals and cash position. Open any card for the per-entity detail.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <BalanceCard
          href="/suppliers"
          title="Payables"
          hint="Total owed to suppliers — open the Suppliers directory"
          icon={Receipt}
          amount={formatTry(payables.totalKurus)}
          amountClass={payables.totalKurus > 0 ? "text-destructive" : undefined}
          loading={payables.loading}
        />
        <BalanceCard
          href="/customers"
          title="Receivables"
          hint="Total owed to you — open the Customers directory"
          icon={HandCoins}
          amount={formatTry(receivables.totalKurus)}
          amountClass={receivables.totalKurus > 0 ? "text-success" : undefined}
          loading={receivables.loading}
        />
        <BalanceCard
          href="/banking"
          title="Cash & bank"
          hint="Money you hold — open Banking for each account"
          icon={Wallet}
          amount={formatTry(cashAndBankKurus)}
          loading={moneyLoading}
        />
        <BalanceCard
          href="/staff"
          title="Staff balances"
          hint={
            staff.totalKurus < 0
              ? `Staff hold this much of your money — ${subledgerCountLabel(staff.count, "employee")}`
              : `Owed to employees — ${subledgerCountLabel(staff.count, "employee")}`
          }
          icon={Users}
          amount={formatTry(staff.totalKurus)}
          // Owed to staff is money out of the business; a negative total means
          // they are holding advances, which is the other way round.
          amountClass={
            staff.totalKurus > 0
              ? "text-destructive"
              : staff.totalKurus < 0
                ? "text-success"
                : undefined
          }
          loading={staff.loading}
        />
        <BalanceCard
          href="/partners"
          title="Partner balances"
          hint={`Loans, drawings and capital — ${subledgerCountLabel(partners.count, "partner")}`}
          icon={Banknote}
          amount={formatTry(partners.totalKurus)}
          amountClass={
            partners.totalKurus > 0 ? "text-destructive" : undefined
          }
          loading={partners.loading}
        />
      </div>
    </>
  );
}
