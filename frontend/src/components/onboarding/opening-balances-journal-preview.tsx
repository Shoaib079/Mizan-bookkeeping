"use client";

/** Journal preview / posted table for opening balances. */

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
import { DESKTOP_SHELL_ONLY, MOBILE_SHELL_ONLY } from "@/lib/mobile-shell";
import { formatTry } from "@/lib/money";
import type {
  JournalLineOut,
  OpeningBalancePostResponse,
} from "@/lib/settings-types";
import { cn } from "@/lib/utils";

type Props = {
  preview: JournalLineOut[];
  previewMessage: string | null;
  posted: OpeningBalancePostResponse | null;
  accountLabel: (code: string) => string;
};

function signedAmount(row: JournalLineOut): number {
  return row.side === "credit" ? -row.amount_kurus : row.amount_kurus;
}

export function OpeningBalancesJournalPreview({
  preview,
  previewMessage,
  posted,
  accountLabel,
}: Props) {
  return (
    <>
      {previewMessage && !posted && (
        <p className="text-sm text-muted-foreground">{previewMessage}</p>
      )}

      {preview.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">
            {posted ? "Posted journal" : "Journal preview"}
          </h2>

          <MobileCardList className={MOBILE_SHELL_ONLY}>
            {preview.map((row, i) => {
              const signed = signedAmount(row);
              return (
                <MobileCardRow
                  key={`${row.account_code}-${i}`}
                  title={accountLabel(row.account_code)}
                  meta={<span className="capitalize">{row.side}</span>}
                  amount={formatTry(row.amount_kurus)}
                  amountClassName={moneyAmountClassName(signed)}
                  leadingIcon={moneyLeadingIcon(signed)}
                />
              );
            })}
          </MobileCardList>

          <div className={cn(DESKTOP_SHELL_ONLY)}>
            <DataTable>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Account</DataTableHeaderCell>
                  <DataTableHeaderCell>Side</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {preview.map((row, i) => (
                  <DataTableRow key={`${row.account_code}-${i}`}>
                    <DataTableCell>
                      {accountLabel(row.account_code)}
                    </DataTableCell>
                    <DataTableCell className="capitalize">{row.side}</DataTableCell>
                    <DataTableCell align="right" className="tabular-nums">
                      {formatTry(row.amount_kurus)}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </div>

          {posted && (
            <p className="mt-2 text-sm text-muted-foreground">
              Journal entry {posted.journal_entry_id} posted successfully.
            </p>
          )}
        </section>
      )}
    </>
  );
}
