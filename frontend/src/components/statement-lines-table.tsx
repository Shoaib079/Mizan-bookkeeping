"use client";

import {
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableHeaderCell,
} from "@/components/ui/data-table";
import { StatementLineClassifyRow } from "@/components/statement-line-classify-row";
import type { BankStatementLine } from "@/lib/banking-types";
import type { StatementClassificationPickers } from "@/lib/use-statement-classification-pickers";

type Props = {
  statementId: string;
  lines: BankStatementLine[];
  pickers: StatementClassificationPickers;
  onClassified: () => void;
};

export function StatementLinesTable({
  statementId,
  lines,
  pickers,
  onClassified,
}: Props) {
  if (lines.length === 0) return null;

  return (
    <DataTable className="max-h-[min(70vh,900px)]">
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Date</DataTableHeaderCell>
          <DataTableHeaderCell>Ref</DataTableHeaderCell>
          <DataTableHeaderCell>Description (as on statement)</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
          <DataTableHeaderCell>Classification</DataTableHeaderCell>
          <DataTableHeaderCell>Link to</DataTableHeaderCell>
          <DataTableHeaderCell>Action</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {lines.map((line) => (
          <StatementLineClassifyRow
            key={line.id}
            statementId={statementId}
            line={line}
            pickers={pickers}
            onClassified={onClassified}
          />
        ))}
      </DataTableBody>
    </DataTable>
  );
}
