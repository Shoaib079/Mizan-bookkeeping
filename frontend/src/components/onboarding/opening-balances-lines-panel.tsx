"use client";

/** Balance lines list + Cash drawer / Bank / Add line actions. */

import { OpeningBalancesLineRow } from "@/components/onboarding/opening-balances-line-row";
import { Button } from "@/components/ui/button";
import type { MoneyAccountOption } from "@/lib/load-money-accounts";
import type { NamedRow } from "@/lib/opening-balances-draft";
import type {
  OpeningBalanceAccount,
  OpeningBalanceLineDraft,
} from "@/lib/settings-types";

type Props = {
  lines: OpeningBalanceLineDraft[];
  lineHints: { id: string; hint: string | null }[];
  obAccounts: OpeningBalanceAccount[];
  moneyAccounts: MoneyAccountOption[];
  cashAccountCount: number;
  suppliers: NamedRow[];
  partners: NamedRow[];
  customers: NamedRow[];
  canAddCashDrawer: boolean;
  canAddBank: boolean;
  onUpdateLine: (id: string, patch: Partial<OpeningBalanceLineDraft>) => void;
  onRemoveLine: (id: string) => void;
  onAddCashDrawer: () => void;
  onAddBank: () => void;
  onAddBlank: () => void;
};

export function OpeningBalancesLinesPanel({
  lines,
  lineHints,
  obAccounts,
  moneyAccounts,
  cashAccountCount,
  suppliers,
  partners,
  customers,
  canAddCashDrawer,
  canAddBank,
  onUpdateLine,
  onRemoveLine,
  onAddCashDrawer,
  onAddBank,
  onAddBlank,
}: Props) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Balance lines</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            For cash drawer and bank balances, choose type{" "}
            <span className="font-medium">Bank / cash account</span> and pick
            the account — one line per account. Balance with equity, payables,
            or other GL lines.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!canAddCashDrawer}
            onClick={onAddCashDrawer}
          >
            + Cash drawer
          </Button>
          <Button type="button" disabled={!canAddBank} onClick={onAddBank}>
            + Bank account
          </Button>
          <Button type="button" onClick={onAddBlank}>
            Add line
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {lines.map((line) => {
          const lineHint =
            lineHints.find((row) => row.id === line.id)?.hint ?? null;
          return (
            <OpeningBalancesLineRow
              key={line.id}
              line={line}
              lineHint={lineHint}
              canRemove={lines.length > 1}
              obAccounts={obAccounts}
              moneyAccounts={moneyAccounts}
              cashAccountCount={cashAccountCount}
              suppliers={suppliers}
              partners={partners}
              customers={customers}
              onUpdate={onUpdateLine}
              onRemove={onRemoveLine}
            />
          );
        })}
      </div>
    </div>
  );
}
