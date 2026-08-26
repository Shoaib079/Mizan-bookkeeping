"use client";

/** FX hub merged ledger table + date range. */

import Link from "next/link";

import { ReportDateRange } from "@/components/reports/report-date-range";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import type { FxLedgerRowWithWallet } from "@/lib/banking-tree-helpers";
import { formatFxNative } from "@/lib/fx-money";
import {
  moneyAmountClassName,
  moneyLeadingIcon,
} from "@/lib/mobile-ledger-card";
import { formatTrDate, formatTry } from "@/lib/money";
import { useIsMobileShell } from "@/lib/use-mobile-shell";

export type FxHubLedgerProps = {
  from: string;
  to: string;
  onRangeChange: (from: string, to: string) => void;
  ledgerLoading: boolean;
  walletCount: number;
  mergedLedger: FxLedgerRowWithWallet[];
};

export function FxHubLedger({
  from,
  to,
  onRangeChange,
  ledgerLoading,
  walletCount,
  mergedLedger,
}: FxHubLedgerProps) {
  const isMobile = useIsMobileShell();

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-sm font-semibold">Ledger</h2>
        <ReportDateRange
          from={from}
          to={to}
          disabled={ledgerLoading}
          onChange={onRangeChange}
        />
      </div>
      {walletCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          No FX wallets yet — add one above.
        </p>
      ) : ledgerLoading ? (
        <p className="text-sm text-muted-foreground">Loading ledger…</p>
      ) : mergedLedger.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No FX movements in this date range.
        </p>
      ) : isMobile ? (
        <MobileCardList>
          {mergedLedger.map((row) => {
            const signed = row.native_quantity;
            return (
              <MobileCardRow
                key={row.id}
                href={`/banking/fx/${row.fx_money_account_id}`}
                title={row.description}
                meta={
                  <>
                    <span>{row.wallet_name}</span>
                    <span>·</span>
                    <span>{row.movement_type}</span>
                    <span>·</span>
                    <span>{formatTrDate(row.movement_date)}</span>
                    <span>
                      {formatFxNative(
                        Math.abs(row.native_quantity),
                        row.wallet_currency,
                      )}
                    </span>
                  </>
                }
                amount={formatTry(row.try_cost_kurus)}
                amountClassName={moneyAmountClassName(signed)}
                leadingIcon={moneyLeadingIcon(signed)}
              />
            );
          })}
        </MobileCardList>
      ) : (
        <DataTable wide>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Date</DataTableHeaderCell>
              <DataTableHeaderCell>Wallet</DataTableHeaderCell>
              <DataTableHeaderCell>Type</DataTableHeaderCell>
              <DataTableHeaderCell>Description</DataTableHeaderCell>
              <DataTableHeaderCell align="right">FX</DataTableHeaderCell>
              <DataTableHeaderCell align="right">TRY cost</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {mergedLedger.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>
                  <Link
                    href={`/banking/fx/${row.fx_money_account_id}`}
                    className="text-primary hover:underline"
                  >
                    {formatTrDate(row.movement_date)}
                  </Link>
                </DataTableCell>
                <DataTableCell>
                  <Link
                    href={`/banking/fx/${row.fx_money_account_id}`}
                    className="text-primary hover:underline"
                  >
                    {row.wallet_name}
                  </Link>
                </DataTableCell>
                <DataTableCell>{row.movement_type}</DataTableCell>
                <DataTableCell>{row.description}</DataTableCell>
                <DataTableCell align="right">
                  {formatFxNative(
                    Math.abs(row.native_quantity),
                    row.wallet_currency,
                  )}
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.try_cost_kurus)}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </section>
  );
}
