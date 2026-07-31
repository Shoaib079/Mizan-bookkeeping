"use client";

/** Dashboard snapshot cards — payables, receivables, cash, FX, staff, partners.
 * Embedded on the home dashboard; cards link to the owning directory. */

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import {
  ArrowRight,
  Banknote,
  Coins,
  HandCoins,
  Receipt,
  Users,
} from "lucide-react";

import type { MoneyAccountTree } from "@/lib/banking-types";
import {
  fxHoldingsNativeSummary,
} from "@/lib/banking-tree-helpers";
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
        <div
          className={cn(
            "mb-1 text-2xl font-semibold tabular-nums",
            amount.length > 18 && "text-lg",
            amountClass,
          )}
        >
          {loading ? "…" : amount}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </Link>
  );
}

function staffHint(
  netSign: number,
  count: number,
  fxCount: number,
  loadFailed: boolean,
): string {
  const people = subledgerCountLabel(count, "employee");
  if (count === 0) return "No employees yet";
  if (loadFailed) return `Could not load balances — ${people}`;
  const fxNote =
    fxCount > 0
      ? ` · includes ${subledgerCountLabel(fxCount, "FX employee")} in their currency`
      : "";
  if (netSign < 0) {
    return `Staff hold this much of your money — ${people}${fxNote}`;
  }
  return `Owed to employees — ${people}${fxNote}`;
}

type Props = {
  /** When embedded on the dashboard, omit the page intro (section heading lives above). */
  embedded?: boolean;
};

export function BalancesOverview({ embedded = false }: Props) {
  const { entityId } = useEntity();
  const payables = useSupplierBalances(entityId ?? "");
  const receivables = useCustomerBalances(entityId ?? "");
  const staff = useStaffBalanceTotal(entityId);
  const partners = usePartnerBalanceTotal(entityId);

  // FX wallets fetched separately — not mixed into cash or bank.
  const [fxNativeSummary, setFxNativeSummary] = useState("No holdings");
  const [fxLoading, setFxLoading] = useState(false);

  useEffect(() => {
    if (!entityId) {
      setFxNativeSummary("No holdings");
      return;
    }
    let cancelled = false;
    setFxLoading(true);
    void apiFetch<MoneyAccountTree>(
      `/entities/${entityId}/banking/accounts/tree`,
    )
      .then((tree) => {
        if (cancelled) return;
        setFxNativeSummary(fxHoldingsNativeSummary(tree));
      })
      .catch(() => {
        if (!cancelled) setFxNativeSummary("No holdings");
      })
      .finally(() => {
        if (!cancelled) setFxLoading(false);
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
      {!embedded && (
        <p className="mb-4 text-sm text-muted-foreground">
          Grand totals and cash position. Foreign currency is listed on its own —
          not mixed into cash & bank. Open any card for detail.
        </p>
      )}
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
          href="/banking/fx"
          title="Foreign currency"
          hint="Held as FX (not converted to ₺ here) — open Banking → FX"
          icon={Coins}
          amount={fxNativeSummary}
          loading={fxLoading}
        />
        <BalanceCard
          href="/staff"
          title="Staff balances"
          hint={staffHint(
            staff.netSign,
            staff.count,
            staff.fxCount,
            staff.loadFailed,
          )}
          icon={Users}
          amount={staff.amountLabel}
          amountClass={
            staff.netSign > 0
              ? "text-destructive"
              : staff.netSign < 0
                ? "text-success"
                : undefined
          }
          loading={staff.loading}
        />
        <BalanceCard
          href="/partners"
          title="Partner balances"
          hint={`Reimbursement / loans owed — ${subledgerCountLabel(partners.count, "partner")} (capital is on each partner)`}
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
