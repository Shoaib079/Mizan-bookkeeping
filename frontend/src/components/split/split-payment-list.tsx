"use client";

import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { formatTrDate, formatTry } from "@/lib/money";

import type { PaymentCandidate } from "@/components/split/split-hub-types";

type Props = {
  payments: PaymentCandidate[];
  onSelect: (ledgerEntryId: string) => void;
};

export function SplitPaymentList({ payments, onSelect }: Props) {
  if (payments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No supplier payments left to split. Pay a supplier from the bank
        statement (or cash) first.
      </p>
    );
  }

  return (
    <div className="mb-8 overflow-x-auto">
      <DataTable wide>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Date</DataTableHeaderCell>
            <DataTableHeaderCell>Supplier</DataTableHeaderCell>
            <DataTableHeaderCell>Description</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Total</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Left</DataTableHeaderCell>
            <DataTableHeaderCell> </DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {payments.map((row) => (
            <DataTableRow key={row.supplier_ledger_entry_id}>
              <DataTableCell>{formatTrDate(row.payment_date)}</DataTableCell>
              <DataTableCell>{row.supplier_name}</DataTableCell>
              <DataTableCell>{row.description}</DataTableCell>
              <DataTableCell align="right">
                {formatTry(row.amount_kurus)}
              </DataTableCell>
              <DataTableCell align="right">
                {formatTry(row.remaining_splittable_kurus)}
              </DataTableCell>
              <DataTableCell>
                <Button
                  type="button"
                  className="h-8"
                  onClick={() => onSelect(row.supplier_ledger_entry_id)}
                >
                  Select
                </Button>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </div>
  );
}
