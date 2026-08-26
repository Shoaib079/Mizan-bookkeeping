"use client";

/** Bank statement list + credit-card payment list — desktop table / phone cards. */

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
import type {
  BankStatementRead,
  CreditCardPaymentRead,
} from "@/lib/banking-types";
import {
  moneyAmountClassName,
  moneyLeadingIcon,
} from "@/lib/mobile-ledger-card";
import { formatTrDate, formatTry } from "@/lib/money";

type StatementsProps = {
  statements: BankStatementRead[];
  isMobile: boolean;
};

export function AccountStatementsList({
  statements,
  isMobile,
}: StatementsProps) {
  if (isMobile) {
    return (
      <MobileCardList>
        {statements.map((stmt) => {
          const closing = stmt.closing_balance_kurus;
          return (
            <MobileCardRow
              key={stmt.id}
              href={`/banking/statements/${stmt.id}`}
              title={stmt.original_filename}
              meta={
                <>
                  <span>Statement</span>
                  <span>·</span>
                  <span>
                    {formatTrDate(stmt.period_start)} –{" "}
                    {formatTrDate(stmt.period_end)}
                  </span>
                  <span>{stmt.line_count} lines</span>
                </>
              }
              amount={
                closing != null ? formatTry(closing) : "—"
              }
              amountClassName={
                closing != null ? moneyAmountClassName(closing) : undefined
              }
              leadingIcon={
                closing != null ? moneyLeadingIcon(closing) : undefined
              }
            />
          );
        })}
      </MobileCardList>
    );
  }

  return (
    <DataTable wide>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Period</DataTableHeaderCell>
          <DataTableHeaderCell>File</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Lines</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Closing</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {statements.map((stmt) => (
          <DataTableRow key={stmt.id}>
            <DataTableCell>
              <Link
                href={`/banking/statements/${stmt.id}`}
                className="text-primary hover:underline"
              >
                {formatTrDate(stmt.period_start)} –{" "}
                {formatTrDate(stmt.period_end)}
              </Link>
            </DataTableCell>
            <DataTableCell>{stmt.original_filename}</DataTableCell>
            <DataTableCell align="right">{stmt.line_count}</DataTableCell>
            <DataTableCell align="right" className="tabular-nums">
              {stmt.closing_balance_kurus != null
                ? formatTry(stmt.closing_balance_kurus)
                : "—"}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

type CardPaymentsProps = {
  payments: CreditCardPaymentRead[];
  bankNames: Record<string, string>;
  isMobile: boolean;
};

export function AccountCardPaymentsList({
  payments,
  bankNames,
  isMobile,
}: CardPaymentsProps) {
  if (isMobile) {
    return (
      <MobileCardList>
        {payments.map((row) => {
          // Paying the card bill is money out of the bank.
          const signed = -Math.abs(row.amount_kurus);
          return (
            <MobileCardRow
              key={row.id}
              title={row.description}
              meta={
                <>
                  <span>Card payment</span>
                  <span>·</span>
                  <span>{formatTrDate(row.payment_date)}</span>
                  <span>
                    {bankNames[row.bank_money_account_id] ??
                      row.bank_money_account_id.slice(0, 8)}
                  </span>
                </>
              }
              amount={formatTry(row.amount_kurus)}
              amountClassName={moneyAmountClassName(signed)}
              leadingIcon={moneyLeadingIcon(signed)}
            />
          );
        })}
      </MobileCardList>
    );
  }

  return (
    <DataTable wide>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Date</DataTableHeaderCell>
          <DataTableHeaderCell>Bank account</DataTableHeaderCell>
          <DataTableHeaderCell>Description</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {payments.map((row) => (
          <DataTableRow key={row.id}>
            <DataTableCell>{formatTrDate(row.payment_date)}</DataTableCell>
            <DataTableCell>
              {bankNames[row.bank_money_account_id] ??
                row.bank_money_account_id.slice(0, 8)}
            </DataTableCell>
            <DataTableCell>{row.description}</DataTableCell>
            <DataTableCell align="right">
              {formatTry(row.amount_kurus)}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
