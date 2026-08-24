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
import { formatTry } from "@/lib/money";
import type {
  JournalLineOut,
  OpeningBalancePostResponse,
} from "@/lib/settings-types";

type Props = {
  preview: JournalLineOut[];
  previewMessage: string | null;
  posted: OpeningBalancePostResponse | null;
  accountLabel: (code: string) => string;
};

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
                  <DataTableCell>{accountLabel(row.account_code)}</DataTableCell>
                  <DataTableCell className="capitalize">{row.side}</DataTableCell>
                  <DataTableCell align="right" className="tabular-nums">
                    {formatTry(row.amount_kurus)}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
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
