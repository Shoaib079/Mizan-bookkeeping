"use client";

/** Cash flow category + source tables — desktop + phone cards. */

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
import type { CashFlowRead } from "@/lib/report-types";

type CategoryProps = {
  operating: CashFlowRead["operating"];
  investing: CashFlowRead["investing"];
  financing: CashFlowRead["financing"];
  isMobile: boolean;
};

export function CashFlowByCategory({
  operating,
  investing,
  financing,
  isMobile,
}: CategoryProps) {
  const rows = [
    ["Operating", operating],
    ["Investing", investing],
    ["Financing", financing],
  ] as const;

  if (isMobile) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-semibold">By category</h2>
        <MobileCardList>
          {rows.map(([label, cat]) => (
            <MobileCardRow
              key={label}
              title={label}
              meta={
                <>
                  <span>Category</span>
                  <span>·</span>
                  <span>In {formatTry(cat.inflows_kurus)}</span>
                  <span>Out {formatTry(cat.outflows_kurus)}</span>
                </>
              }
              amount={formatTry(cat.net_kurus)}
              amountClassName={moneyAmountClassName(cat.net_kurus)}
              leadingIcon={moneyLeadingIcon(cat.net_kurus)}
            />
          ))}
        </MobileCardList>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">By category</h2>
      <DataTable wide>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Category</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Inflows</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Outflows</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Net</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.map(([label, cat]) => (
            <DataTableRow key={label}>
              <DataTableCell>{label}</DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {formatTry(cat.inflows_kurus)}
              </DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {formatTry(cat.outflows_kurus)}
              </DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {formatTry(cat.net_kurus)}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </section>
  );
}

type SourceProps = {
  rows: CashFlowRead["by_source"];
  isMobile: boolean;
};

export function CashFlowBySource({ rows, isMobile }: SourceProps) {
  if (rows.length === 0) return null;

  if (isMobile) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-semibold">By source</h2>
        <MobileCardList>
          {rows.map((row) => (
            <MobileCardRow
              key={`${row.source}-${row.category}`}
              title={row.source}
              meta={
                <>
                  <span className="capitalize">{row.category}</span>
                </>
              }
              amount={formatTry(row.net_cash_kurus)}
              amountClassName={moneyAmountClassName(row.net_cash_kurus)}
              leadingIcon={moneyLeadingIcon(row.net_cash_kurus)}
            />
          ))}
        </MobileCardList>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">By source</h2>
      <DataTable wide>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Source</DataTableHeaderCell>
            <DataTableHeaderCell>Category</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Net cash</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.map((row) => (
            <DataTableRow key={`${row.source}-${row.category}`}>
              <DataTableCell>{row.source}</DataTableCell>
              <DataTableCell className="capitalize">{row.category}</DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {formatTry(row.net_cash_kurus)}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </section>
  );
}
