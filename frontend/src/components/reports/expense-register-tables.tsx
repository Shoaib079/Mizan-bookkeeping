"use client";

/** Expense register tables — desktop + phone cards. */

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
import type { ExpenseRegisterRead } from "@/lib/report-types";
import { ledgerEntryHref, sourceLabel } from "@/lib/transaction-registry";

type AccountTotalsProps = {
  totals: ExpenseRegisterRead["account_totals"];
  onSelectAccount: (accountId: string) => void;
  isMobile: boolean;
};

export function ExpenseRegisterAccountTotals({
  totals,
  onSelectAccount,
  isMobile,
}: AccountTotalsProps) {
  if (totals.length === 0) return null;

  if (isMobile) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-semibold">By account</h2>
        <MobileCardList>
          {totals.map((total) => {
            const signed = -Math.abs(total.amount_kurus);
            return (
              <MobileCardRow
                key={total.account_id}
                onClick={() => onSelectAccount(total.account_id)}
                title={`${total.account_code} — ${total.account_name}`}
                meta={
                  <>
                    <span>Account</span>
                    <span>·</span>
                    <span>
                      {total.entry_count} entr
                      {total.entry_count === 1 ? "y" : "ies"}
                    </span>
                  </>
                }
                amount={formatTry(total.amount_kurus)}
                amountClassName={moneyAmountClassName(signed)}
                leadingIcon={moneyLeadingIcon(signed)}
              />
            );
          })}
        </MobileCardList>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">By account</h2>
      <DataTable wide>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Account</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Entries</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Total</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {totals.map((total) => (
            <DataTableRow
              key={total.account_id}
              className="cursor-pointer"
              onClick={() => onSelectAccount(total.account_id)}
            >
              <DataTableCell>
                {total.account_code} — {total.account_name}
              </DataTableCell>
              <DataTableCell align="right">{total.entry_count}</DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {formatTry(total.amount_kurus)}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </section>
  );
}

type EntriesProps = {
  rows: ExpenseRegisterRead["rows"];
  isMobile: boolean;
};

export function ExpenseRegisterEntries({ rows, isMobile }: EntriesProps) {
  if (isMobile) {
    return (
      <MobileCardList>
        {rows.map((row, index) => {
          const signed = -Math.abs(row.amount_kurus);
          return (
            <MobileCardRow
              key={`${row.journal_entry_id}-${index}`}
              href={ledgerEntryHref(row.journal_entry_id)}
              title={row.description}
              meta={
                <>
                  <span>{sourceLabel(row.source)}</span>
                  <span>·</span>
                  <span>{formatTrDate(row.entry_date)}</span>
                  <span>
                    {row.account_code} — {row.account_name}
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
          <DataTableHeaderCell>Account</DataTableHeaderCell>
          <DataTableHeaderCell>Description</DataTableHeaderCell>
          <DataTableHeaderCell>Recorded as</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {rows.map((row, index) => (
          <DataTableRow key={`${row.journal_entry_id}-${index}`}>
            <DataTableCell>{formatTrDate(row.entry_date)}</DataTableCell>
            <DataTableCell>
              {row.account_code} — {row.account_name}
            </DataTableCell>
            <DataTableCell>
              <Link
                href={ledgerEntryHref(row.journal_entry_id)}
                className="hover:underline"
              >
                {row.description}
              </Link>
            </DataTableCell>
            <DataTableCell className="text-muted-foreground">
              {sourceLabel(row.source)}
            </DataTableCell>
            <DataTableCell align="right" className="tabular-nums">
              {formatTry(row.amount_kurus)}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
