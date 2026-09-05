"use client";

/** Group sale detail — menu lines as table (desktop) or cards (phone). */

import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { formatFxNative } from "@/lib/fx-money";
import type { GroupSaleLineRead } from "@/lib/group-sales-types";
import { DESKTOP_SHELL_ONLY, MOBILE_SHELL_ONLY } from "@/lib/mobile-shell";
import { formatTry } from "@/lib/money";
import { cn } from "@/lib/utils";

type Props = {
  lines: GroupSaleLineRead[];
  forexCurrency: string | null | undefined;
};

function rateLabel(line: GroupSaleLineRead, isForex: boolean, currency: string) {
  return isForex
    ? formatFxNative(line.rate_per_person_minor, currency)
    : formatTry(line.rate_per_person_minor);
}

function totalLabel(line: GroupSaleLineRead, isForex: boolean, currency: string) {
  return isForex
    ? formatFxNative(line.line_total_minor, currency)
    : formatTry(line.line_total_minor);
}

export function GroupSaleMenuLines({ lines, forexCurrency }: Props) {
  const isForex = Boolean(forexCurrency);
  const currency = forexCurrency ?? "";

  return (
    <>
      <MobileCardList className={MOBILE_SHELL_ONLY}>
        {lines.map((line) => (
          <MobileCardRow
            key={line.id}
            title={line.menu_name_snapshot}
            meta={
              <>
                <span>{line.pax} pax</span>
                <span aria-hidden>·</span>
                <span>{rateLabel(line, isForex, currency)} / person</span>
              </>
            }
            amount={totalLabel(line, isForex, currency)}
            amountNote={
              isForex ? `${formatTry(line.line_total_kurus)} TRY` : undefined
            }
          />
        ))}
      </MobileCardList>

      <div className={cn(DESKTOP_SHELL_ONLY)}>
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Menu</DataTableHeaderCell>
              <DataTableHeaderCell>Pax</DataTableHeaderCell>
              <DataTableHeaderCell>Rate / person</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Line total</DataTableHeaderCell>
              <DataTableHeaderCell align="right">TRY</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {lines.map((line) => (
              <DataTableRow key={line.id}>
                <DataTableCell>{line.menu_name_snapshot}</DataTableCell>
                <DataTableCell>{line.pax}</DataTableCell>
                <DataTableCell className="tabular-nums">
                  {rateLabel(line, isForex, currency)}
                </DataTableCell>
                <DataTableCell align="right" className="tabular-nums">
                  {totalLabel(line, isForex, currency)}
                </DataTableCell>
                <DataTableCell align="right" className="tabular-nums">
                  {formatTry(line.line_total_kurus)}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      </div>
    </>
  );
}
