"use client";

/** Locked Main Drawer display for Count cash / Close day (+ home as reference). */

import type { MoneyAccountLeaf } from "@/lib/banking-types";
import { formatTry } from "@/lib/money";

type Props = {
  till: MoneyAccountLeaf | null;
  home: MoneyAccountLeaf | null;
  /** Expected / books balance for the till (same as till.balance when loaded). */
  expectedKurus?: number | null;
};

export function MainTillReference({ till, home, expectedKurus }: Props) {
  const books =
    expectedKurus !== null && expectedKurus !== undefined
      ? expectedKurus
      : (till?.balance_kurus ?? null);

  return (
    <div
      className="space-y-3 rounded-md border border-border bg-muted/40 p-3"
      data-testid="main-till-reference"
    >
      <div>
        <p className="text-sm font-medium">
          {till?.name ?? "Main Drawer"}
        </p>
        <p className="text-xs text-muted-foreground">
          Counter till — Count cash and Close day only use this drawer.
        </p>
        {books !== null && (
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <span className="text-sm text-muted-foreground">
              Should be in the till
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {formatTry(books)}
            </span>
          </div>
        )}
      </div>
      {home && (
        <div className="border-t border-border pt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{home.name}</span>
          {" — "}
          <span className="tabular-nums">{formatTry(home.balance_kurus)}</span>
          <span className="block text-xs mt-0.5">
            Reference only. Do not count or close this here — it holds cash sent
            home after Close day.
          </span>
        </div>
      )}
    </div>
  );
}
