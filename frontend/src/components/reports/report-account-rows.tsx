"use client";

/** Shared account Code / Name / Amount rows for P&L and balance sheet. */

import type { ReactNode } from "react";

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
import { formatTry } from "@/lib/money";

export type ReportAccountRow = {
  account_id: string;
  code: string;
  name_en: string;
  amount_kurus: number;
};

type Props = {
  rows: ReportAccountRow[];
  amountHeader: string;
  typeLabel: string;
  isMobile: boolean;
  /** Treat positive amounts as outflows (expenses). */
  forceOut?: boolean;
  extraMobile?: ReactNode;
  extraDesktop?: ReactNode;
};

export function ReportAccountRows({
  rows,
  amountHeader,
  typeLabel,
  isMobile,
  forceOut = false,
  extraMobile,
  extraDesktop,
}: Props) {
  if (isMobile) {
    return (
      <MobileCardList>
        {rows.map((row) => {
          const signed = forceOut ? -Math.abs(row.amount_kurus) : row.amount_kurus;
          return (
            <MobileCardRow
              key={row.account_id}
              title={row.name_en}
              meta={
                <>
                  <span>{typeLabel}</span>
                  <span>·</span>
                  <span className="font-mono text-xs">{row.code}</span>
                </>
              }
              amount={formatTry(row.amount_kurus)}
              amountClassName={moneyAmountClassName(signed)}
              leadingIcon={moneyLeadingIcon(signed)}
            />
          );
        })}
        {extraMobile}
      </MobileCardList>
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Code</DataTableHeaderCell>
          <DataTableHeaderCell>Account</DataTableHeaderCell>
          <DataTableHeaderCell align="right">{amountHeader}</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {rows.map((row) => (
          <DataTableRow key={row.account_id}>
            <DataTableCell className="font-mono text-xs">{row.code}</DataTableCell>
            <DataTableCell>{row.name_en}</DataTableCell>
            <DataTableCell align="right" className="tabular-nums">
              {formatTry(row.amount_kurus)}
            </DataTableCell>
          </DataTableRow>
        ))}
        {extraDesktop}
      </DataTableBody>
    </DataTable>
  );
}
