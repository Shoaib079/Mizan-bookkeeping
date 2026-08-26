"use client";

/** KDV input rate table — desktop + phone cards. */

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
import type { KdvInputReportRead } from "@/lib/report-types";

type Props = {
  rates: KdvInputReportRead["rates"];
  isMobile: boolean;
};

export function KdvInputRateTable({ rates, isMobile }: Props) {
  if (rates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No posted purchase invoices in this period.
      </p>
    );
  }

  if (isMobile) {
    return (
      <MobileCardList>
        {rates.map((row) => {
          const signed = -Math.abs(row.vat_kurus);
          return (
            <MobileCardRow
              key={row.rate_percent}
              title={`%${row.rate_percent} VAT`}
              meta={
                <>
                  <span>Rate</span>
                  <span>·</span>
                  <span>Base {formatTry(row.base_kurus)}</span>
                  <span>
                    {row.invoice_count} invoice
                    {row.invoice_count === 1 ? "" : "s"}
                  </span>
                </>
              }
              amount={formatTry(row.vat_kurus)}
              amountClassName={moneyAmountClassName(signed)}
              leadingIcon={moneyLeadingIcon(signed)}
            />
          );
        })}
      </MobileCardList>
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Rate</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Base</DataTableHeaderCell>
          <DataTableHeaderCell align="right">VAT</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Invoices</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {rates.map((row) => (
          <DataTableRow key={row.rate_percent}>
            <DataTableCell className="tabular-nums">
              %{row.rate_percent}
            </DataTableCell>
            <DataTableCell align="right" className="tabular-nums">
              {formatTry(row.base_kurus)}
            </DataTableCell>
            <DataTableCell align="right" className="tabular-nums">
              {formatTry(row.vat_kurus)}
            </DataTableCell>
            <DataTableCell align="right" className="tabular-nums">
              {row.invoice_count}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
