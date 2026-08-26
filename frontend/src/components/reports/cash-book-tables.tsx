"use client";

/** Cash book movement + summary tables — desktop + phone cards. */

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
import type { CashBookRead } from "@/lib/report-types";
import { ledgerEntryHref, sourceLabel } from "@/lib/transaction-registry";
import { cn } from "@/lib/utils";

type SourceTotalsProps = {
  totals: CashBookRead["source_totals"];
  isMobile: boolean;
};

export function CashBookSourceTotals({ totals, isMobile }: SourceTotalsProps) {
  if (totals.length === 0) return null;

  if (isMobile) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-semibold">
          Where it came from and went
        </h2>
        <MobileCardList>
          {totals.map((total) => {
            const signed = (total.in_kurus || 0) - (total.out_kurus || 0);
            return (
              <MobileCardRow
                key={total.source}
                title={sourceLabel(total.source)}
                meta={
                  <>
                    <span>Recorded as</span>
                    <span>·</span>
                    <span>
                      {total.entry_count} entr
                      {total.entry_count === 1 ? "y" : "ies"}
                    </span>
                    {total.in_kurus ? (
                      <span>In {formatTry(total.in_kurus)}</span>
                    ) : null}
                    {total.out_kurus ? (
                      <span>Out {formatTry(total.out_kurus)}</span>
                    ) : null}
                  </>
                }
                amount={formatTry(Math.abs(signed) || 0)}
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
      <h2 className="mb-2 text-sm font-semibold">
        Where it came from and went
      </h2>
      <DataTable wide>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Recorded as</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Entries</DataTableHeaderCell>
            <DataTableHeaderCell align="right">In</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Out</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {totals.map((total) => (
            <DataTableRow key={total.source}>
              <DataTableCell>{sourceLabel(total.source)}</DataTableCell>
              <DataTableCell align="right">{total.entry_count}</DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {total.in_kurus ? formatTry(total.in_kurus) : "—"}
              </DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {total.out_kurus ? formatTry(total.out_kurus) : "—"}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </section>
  );
}

type CountsProps = {
  counts: CashBookRead["counts"];
  netCounted: number;
  isMobile: boolean;
};

export function CashBookCountHistory({
  counts,
  netCounted,
  isMobile,
}: CountsProps) {
  if (counts.length === 0) return null;

  const header = (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold">Count history</h2>
      <p className="text-xs text-muted-foreground">
        {counts.length} count{counts.length === 1 ? "" : "s"} ·{" "}
        {counts.filter((c) => c.over_short_kurus === 0).length} matched exactly
        · net{" "}
        <span
          className={cn(
            "font-medium tabular-nums",
            netCounted > 0 && "text-warning",
            netCounted < 0 && "text-destructive",
          )}
        >
          {formatTry(netCounted)}
        </span>
      </p>
    </div>
  );

  const footer = (
    <p className="mt-2 text-xs text-muted-foreground">
      One short day is noise; the same drawer short repeatedly is a pattern
      worth looking into.
    </p>
  );

  if (isMobile) {
    return (
      <section>
        {header}
        <MobileCardList>
          {counts.map((count) => (
            <MobileCardRow
              key={count.session_date}
              title={formatTrDate(count.session_date)}
              meta={
                <>
                  <span>Count</span>
                  <span>·</span>
                  <span>Should be {formatTry(count.expected_kurus)}</span>
                  <span>Counted {formatTry(count.counted_kurus)}</span>
                </>
              }
              amount={
                count.over_short_kurus === 0
                  ? "—"
                  : `${count.over_short_kurus > 0 ? "+" : ""}${formatTry(count.over_short_kurus)}`
              }
              amountClassName={cn(
                count.over_short_kurus === 0 && "text-muted-foreground",
                count.over_short_kurus > 0 && "text-warning",
                count.over_short_kurus < 0 && "text-destructive",
              )}
              leadingIcon={moneyLeadingIcon(count.over_short_kurus)}
            />
          ))}
        </MobileCardList>
        {footer}
      </section>
    );
  }

  return (
    <section>
      {header}
      <DataTable wide>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Date</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Should be</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Counted</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Difference</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {counts.map((count) => (
            <DataTableRow key={count.session_date}>
              <DataTableCell>{formatTrDate(count.session_date)}</DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {formatTry(count.expected_kurus)}
              </DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {formatTry(count.counted_kurus)}
              </DataTableCell>
              <DataTableCell
                align="right"
                className={cn(
                  "tabular-nums",
                  count.over_short_kurus === 0 && "text-muted-foreground",
                  count.over_short_kurus > 0 && "text-warning",
                  count.over_short_kurus < 0 && "text-destructive",
                )}
              >
                {count.over_short_kurus === 0
                  ? "—"
                  : `${count.over_short_kurus > 0 ? "+" : ""}${formatTry(count.over_short_kurus)}`}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
      {footer}
    </section>
  );
}

type MovementsProps = {
  rows: CashBookRead["rows"];
  isMobile: boolean;
};

export function CashBookMovements({ rows, isMobile }: MovementsProps) {
  if (isMobile) {
    return (
      <MobileCardList>
        {rows.map((row, index) => {
          const signed = (row.in_kurus || 0) - (row.out_kurus || 0);
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
                  <span>Bal {formatTry(row.balance_kurus)}</span>
                </>
              }
              amount={
                signed === 0
                  ? formatTry(0)
                  : formatTry(Math.abs(signed))
              }
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
          <DataTableHeaderCell>What</DataTableHeaderCell>
          <DataTableHeaderCell>Recorded as</DataTableHeaderCell>
          <DataTableHeaderCell align="right">In</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Out</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Balance</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {rows.map((row, index) => (
          <DataTableRow key={`${row.journal_entry_id}-${index}`}>
            <DataTableCell>{formatTrDate(row.entry_date)}</DataTableCell>
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
              {row.in_kurus ? formatTry(row.in_kurus) : ""}
            </DataTableCell>
            <DataTableCell align="right" className="tabular-nums">
              {row.out_kurus ? formatTry(row.out_kurus) : ""}
            </DataTableCell>
            <DataTableCell
              align="right"
              className="tabular-nums text-muted-foreground"
            >
              {formatTry(row.balance_kurus)}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
