"use client";

/** Period comparison metrics — desktop + phone cards. */

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
import type { PeriodComparisonRead } from "@/lib/report-types";

function formatChangePercent(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

type Props = {
  metrics: PeriodComparisonRead["metrics"];
  isMobile: boolean;
};

export function PeriodComparisonMetricsTable({ metrics, isMobile }: Props) {
  if (isMobile) {
    return (
      <MobileCardList>
        {metrics.map((row) => (
          <MobileCardRow
            key={row.key}
            title={row.label}
            meta={
              <>
                <span>Metric</span>
                <span>·</span>
                <span>Prior {formatTry(row.prior_kurus)}</span>
                <span>{formatChangePercent(row.change_percent)}</span>
              </>
            }
            amount={formatTry(row.change_kurus)}
            amountNote={`Current ${formatTry(row.current_kurus)}`}
            amountClassName={moneyAmountClassName(row.change_kurus)}
            leadingIcon={moneyLeadingIcon(row.change_kurus)}
          />
        ))}
      </MobileCardList>
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Metric</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Current</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Prior</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Change</DataTableHeaderCell>
          <DataTableHeaderCell align="right">%</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {metrics.map((row) => (
          <DataTableRow key={row.key}>
            <DataTableCell>{row.label}</DataTableCell>
            <DataTableCell align="right" className="tabular-nums">
              {formatTry(row.current_kurus)}
            </DataTableCell>
            <DataTableCell align="right" className="tabular-nums">
              {formatTry(row.prior_kurus)}
            </DataTableCell>
            <DataTableCell align="right" className="tabular-nums">
              {formatTry(row.change_kurus)}
            </DataTableCell>
            <DataTableCell align="right" className="tabular-nums">
              {formatChangePercent(row.change_percent)}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
