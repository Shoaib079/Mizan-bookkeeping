"use client";

/** Bank reconciliation review lines — desktop + phone cards. */

import Link from "next/link";

import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import {
  moneyAmountClassName,
  moneyLeadingIcon,
} from "@/lib/mobile-ledger-card";
import { formatTrDate, formatTry } from "@/lib/money";
import type { BankReconciliationAccount } from "@/lib/report-types";

type Props = {
  lines: BankReconciliationAccount["lines"];
  isMobile: boolean;
};

export function BankReconciliationLines({ lines, isMobile }: Props) {
  if (lines.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Lines still to review</h3>
        <Link
          href="/review/bank"
          className="text-sm text-primary hover:underline"
        >
          Review them →
        </Link>
      </div>
      {isMobile ? (
        <MobileCardList>
          {lines.map((line) => (
            <MobileCardRow
              key={line.id}
              href="/review/bank"
              title={line.description}
              meta={
                <>
                  <span>Statement</span>
                  <span>·</span>
                  <span>{formatTrDate(line.transaction_date)}</span>
                </>
              }
              amount={formatTry(line.amount_kurus)}
              amountClassName={moneyAmountClassName(line.amount_kurus)}
              leadingIcon={moneyLeadingIcon(line.amount_kurus)}
            />
          ))}
        </MobileCardList>
      ) : (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Date</DataTableHeaderCell>
              <DataTableHeaderCell>Description</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {lines.map((line) => (
              <DataTableRow key={line.id}>
                <DataTableCell>
                  {formatTrDate(line.transaction_date)}
                </DataTableCell>
                <DataTableCell>{line.description}</DataTableCell>
                <DataTableCell align="right" className="tabular-nums">
                  {formatTry(line.amount_kurus)}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </div>
  );
}
