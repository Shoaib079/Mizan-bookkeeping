"use client";

/** Delivery sales platform table — desktop + phone cards. */

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
import type { DeliverySalesReportRead } from "@/lib/report-types";

type Props = {
  platforms: DeliverySalesReportRead["platforms"];
  isMobile: boolean;
};

export function DeliverySalesPlatformTable({ platforms, isMobile }: Props) {
  if (platforms.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No posted delivery reports in this period.
      </p>
    );
  }

  if (isMobile) {
    return (
      <MobileCardList>
        {platforms.map((row) => (
          <MobileCardRow
            key={row.delivery_platform_id}
            title={row.platform_name}
            meta={
              <>
                <span>{row.is_active ? "Active" : "Inactive"}</span>
                <span>·</span>
                <span>
                  {row.report_count} report
                  {row.report_count === 1 ? "" : "s"}
                </span>
              </>
            }
            amount={formatTry(row.gross_kurus)}
            amountClassName={moneyAmountClassName(row.gross_kurus)}
            leadingIcon={moneyLeadingIcon(row.gross_kurus)}
          />
        ))}
      </MobileCardList>
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Platform</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Gross</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Reports</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {platforms.map((row) => (
          <DataTableRow key={row.delivery_platform_id}>
            <DataTableCell>{row.platform_name}</DataTableCell>
            <DataTableCell>
              {row.is_active ? "Active" : "Inactive"}
            </DataTableCell>
            <DataTableCell align="right" className="tabular-nums">
              {formatTry(row.gross_kurus)}
            </DataTableCell>
            <DataTableCell align="right" className="tabular-nums">
              {row.report_count}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
