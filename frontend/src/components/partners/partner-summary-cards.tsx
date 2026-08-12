"use client";

/** Partner position, split so profit is never mixed with cash movements
 * (owner decision 2026-07-14). Both panels stay the same size no matter how
 * many allocation periods accumulate — the figures are cumulative. */

import { formatTry } from "@/lib/money";
import type {
  PartnerCashSummary,
  PartnerProfitSummary,
} from "@/lib/partner-summary";
import { cn } from "@/lib/utils";

function Line({
  label,
  hint,
  value,
  valueClassName,
  total = false,
}: {
  label: string;
  hint?: string;
  value: string;
  valueClassName?: string;
  total?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 border-t border-border py-1.5 first:border-t-0",
        total && "mt-1 border-t-2 border-border pt-2.5",
      )}
    >
      <span
        className={cn(
          "text-sm text-muted-foreground",
          total && "font-medium text-foreground",
        )}
      >
        {label}
        {hint && (
          <span className="ml-1 text-xs text-muted-foreground/70">
            · {hint}
          </span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          total ? "text-base font-semibold" : "text-sm",
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Panel({
  title,
  accent = false,
  children,
  footnote,
}: {
  title: string;
  accent?: boolean;
  children: React.ReactNode;
  footnote?: string;
}) {
  return (
    <section
      className={cn(
        "flex-1 overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]",
        accent ? "border-primary/30" : "border-border",
      )}
    >
      <h3
        className={cn(
          "px-4 py-2 text-sm font-medium",
          accent
            ? "bg-primary/10 text-primary"
            : "bg-muted/50 text-muted-foreground",
        )}
      >
        {title}
      </h3>
      <div className="px-4 py-3">
        {children}
        {footnote && (
          <p className="mt-2 text-xs text-muted-foreground">{footnote}</p>
        )}
      </div>
    </section>
  );
}

export function PartnerProfitCard({
  profit,
}: {
  profit: PartnerProfitSummary;
}) {
  const hasHistory = profit.allocatedKurus !== 0 || profit.paidOutKurus !== 0;

  return (
    <Panel
      title="Profit"
      accent
      footnote={
        profit.unpaidKurus > 0
          ? "Held in the business until paid out — and set against anything " +
            "the partner still owes on drawings, so it is not free to spend twice."
          : undefined
      }
    >
      {hasHistory ? (
        <>
          <Line
            label="Allocated to partner"
            hint={
              profit.periodCount > 0
                ? `${profit.periodCount} ${profit.periodCount === 1 ? "period" : "periods"}`
                : undefined
            }
            value={formatTry(profit.allocatedKurus)}
          />
          {profit.usedForDrawingsKurus !== 0 && (
            <Line
              label="Used to clear drawings"
              value={`−${formatTry(profit.usedForDrawingsKurus)}`}
            />
          )}
          {profit.paidOutKurus !== 0 && (
            <Line
              label="Paid out in cash"
              value={`−${formatTry(profit.paidOutKurus)}`}
            />
          )}
          <Line
            total
            label="Still unpaid"
            value={formatTry(profit.unpaidKurus)}
            valueClassName={profit.unpaidKurus > 0 ? "text-success" : undefined}
          />
        </>
      ) : (
        <p className="py-1 text-sm text-muted-foreground">
          No profit allocated yet.
        </p>
      )}
    </Panel>
  );
}

export function PartnerCashCard({ cash }: { cash: PartnerCashSummary }) {
  // Both are drawings in the books, but only one means the partner took money.
  // Shown apart so nobody reads a personal expense split as a withdrawal.
  const mixed = cash.cashTakenKurus !== 0 && cash.personalCostsKurus !== 0;

  return (
    <Panel
      title="Cash & expenses"
      footnote={
        cash.personalCostsKurus !== 0
          ? "Personal costs are business payments covering something personal — no cash left the till, but they reduce capital the same way."
          : undefined
      }
    >
      <Line label="Cash taken" value={formatTry(cash.cashTakenKurus)} />
      <Line
        label="Personal costs paid by business"
        value={formatTry(cash.personalCostsKurus)}
      />
      {mixed && (
        <Line
          label="Total taken out"
          value={formatTry(cash.drawingsTakenKurus)}
        />
      )}
      {/* Gross, then what meets it, then what is actually owed.
        *
        * This line alone used to sit here in red saying 80.800,00 while the
        * heading of the page said the partner owed 12.036,09 and the card
        * beside it said they were owed 68.763,91 of profit. Three figures,
        * one screen, no way to tell which was the answer. The last of these
        * comes from the same balance as the heading, so they cannot part. */}
      <Line
        label="Drawings outstanding"
        value={formatTry(cash.drawingsOutstandingKurus)}
        valueClassName={
          cash.offsetByBalancesKurus > 0 ? undefined : "text-destructive"
        }
      />
      {cash.offsetByBalancesKurus > 0 && (
        <>
          <Line
            label="Offset by profit owed to you"
            value={`−${formatTry(cash.offsetByBalancesKurus)}`}
          />
          <Line
            total
            label="Partner owes"
            value={formatTry(cash.netOwedByPartnerKurus)}
            valueClassName={
              cash.netOwedByPartnerKurus > 0 ? "text-destructive" : "text-success"
            }
          />
        </>
      )}
      <Line
        label="Expenses fronted"
        value={formatTry(cash.expensesFrontedKurus)}
      />
      <Line
        label="Capital contributed"
        value={formatTry(cash.capitalContributedKurus)}
      />
      <Line
        total
        label="Capital in business"
        value={formatTry(cash.capitalInBusinessKurus)}
      />
    </Panel>
  );
}
