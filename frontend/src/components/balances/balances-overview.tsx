"use client";

/** Dashboard snapshot cards — payables, receivables, FX, staff, partners.
 * Cash and bank totals live in the dashboard Cash & bank card (KPI row). */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Banknote,
  Coins,
  HandCoins,
  Receipt,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  IconSquare,
  type IconStroke,
  type IconTint,
} from "@/components/ui/icon-square";
import {
  ACCENT_BAR,
  MeaningCardAccentBar,
  type AccentBarTone,
} from "@/components/ui/meaning-card";
import { apiFetch } from "@/lib/api";
import type { MoneyAccountTree } from "@/lib/banking-types";
import { fxHoldingsNativeSummary } from "@/lib/banking-tree-helpers";
import {
  OVERVIEW_FIGURE_CLASS,
  partnerOverviewDisplay,
  payablesOverviewDisplay,
  receivablesOverviewDisplay,
  staffOverviewHint,
  staffOverviewTone,
  type OverviewFigureTone,
} from "@/lib/balances-overview-display";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import { subledgerCountLabel } from "@/lib/subledger-total";
import {
  useCustomerBalances,
  useSupplierBalances,
} from "@/lib/use-balance-map";
import {
  usePartnerBalanceTotal,
  useStaffBalanceTotal,
} from "@/lib/use-subledger-total";
import { cn } from "@/lib/utils";

type CardProps = {
  href: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  amount?: string;
  figureTone?: OverviewFigureTone;
  loading?: boolean;
  accent: AccentBarTone;
  tint: IconTint;
  stroke: IconStroke;
};

function BalanceCard({
  href,
  title,
  hint,
  icon: Icon,
  amount,
  figureTone,
  loading,
  accent,
  tint,
  stroke,
}: CardProps) {
  return (
    <Link
      href={href}
      data-meaning-card
      data-testid="balances-overview-card"
      data-card-title={title}
      data-accent={accent}
      className="group relative flex flex-col justify-between rounded-[var(--radius-card)] border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/50"
      style={{ ["--accent-bar" as string]: ACCENT_BAR[accent] }}
    >
      <MeaningCardAccentBar />
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-sm font-medium text-foreground">
          <IconSquare icon={Icon} tint={tint} stroke={stroke} size="lg" />
          {title}
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      {amount !== undefined && (
        <div
          data-testid="balances-overview-figure"
          data-figure-tone={figureTone}
          className={cn(
            "mb-1 text-2xl font-semibold tabular-nums",
            amount.length > 18 && "text-lg",
            figureTone ? OVERVIEW_FIGURE_CLASS[figureTone] : undefined,
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

  const staffAccent: AccentBarTone =
    staff.netSign > 0 ? "green" : staff.netSign < 0 ? "red" : "gray";
  const staffTint: IconTint =
    staff.netSign > 0 ? "mint" : staff.netSign < 0 ? "blush" : "gray";
  const staffStroke: IconStroke =
    staff.netSign > 0 ? "green" : staff.netSign < 0 ? "red" : "gray";

  const payablesDisplay = payablesOverviewDisplay(payables.totalKurus);
  const receivablesDisplay = receivablesOverviewDisplay(receivables.totalKurus);
  const partnerHint = `Reimbursement / loans owed — ${subledgerCountLabel(partners.count, "partner")} (capital is on each partner)`;
  const partnersDisplay = partnerOverviewDisplay(
    partners.totalKurus,
    partnerHint,
  );
  const staffTone = staffOverviewTone(staff.netSign);
  const staffCaption = staffOverviewHint(
    staff.netSign,
    staffHint(
      staff.netSign,
      staff.count,
      staff.fxCount,
      staff.loadFailed,
    ),
  );

  return (
    <>
      {!embedded && (
        <p className="mb-4 text-sm text-muted-foreground">
          Grand totals for payables, receivables, and subledgers. Cash and bank
          are on the dashboard Cash & bank card. Open any card for detail.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <BalanceCard
          href="/suppliers"
          title="Payables"
          hint={payablesDisplay.hint}
          icon={Receipt}
          amount={formatTry(payablesDisplay.amountKurus)}
          figureTone={payablesDisplay.tone}
          loading={payables.loading}
          accent="green"
          tint="mint"
          stroke="green"
        />
        <BalanceCard
          href="/customers"
          title="Receivables"
          hint={receivablesDisplay.hint}
          icon={HandCoins}
          amount={formatTry(receivablesDisplay.amountKurus)}
          figureTone={receivablesDisplay.tone}
          loading={receivables.loading}
          accent="red"
          tint="blush"
          stroke="red"
        />
        <BalanceCard
          href="/banking/fx"
          title="Foreign currency"
          hint="Held as FX (not converted to ₺ here) — open Banking → FX"
          icon={Coins}
          amount={fxNativeSummary}
          figureTone="ink"
          loading={fxLoading}
          accent="blue"
          tint="sky"
          stroke="blue"
        />
        <BalanceCard
          href="/staff"
          title="Staff balances"
          hint={staffCaption}
          icon={Users}
          amount={staff.amountLabel}
          figureTone={staffTone}
          loading={staff.loading}
          accent={staffAccent}
          tint={staffTint}
          stroke={staffStroke}
        />
        <BalanceCard
          href="/partners"
          title="Partner balances"
          hint={partnersDisplay.hint}
          icon={Banknote}
          amount={formatTry(partnersDisplay.amountKurus)}
          figureTone={partnersDisplay.tone}
          loading={partners.loading}
          accent={partners.totalKurus > 0 ? "green" : "gray"}
          tint={partners.totalKurus > 0 ? "mint" : "gray"}
          stroke={partners.totalKurus > 0 ? "green" : "gray"}
        />
      </div>
    </>
  );
}
