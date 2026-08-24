"use client";

/** Daily sales table + mobile cards — split from SalesReviewPanel (file size). */

import Link from "next/link";

import { PosDailySalesPostedActions } from "@/components/sales/pos-daily-sales-posted-actions";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableFoot,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatTrDate, formatTry } from "@/lib/money";
import type { PosDailySummary } from "@/lib/pos-delivery-types";
import { isPendingReviewStatus } from "@/lib/review-status";

type Props = {
  items: PosDailySummary[];
  grants: readonly string[];
  showPeriodTotals: boolean;
  cashTotal: number;
  cardTotal: number;
  salesTotal: number;
  onCorrect: (row: PosDailySummary) => void;
  onVoid: (row: PosDailySummary) => void;
};

export function SalesReviewTable({
  items,
  grants,
  showPeriodTotals,
  cashTotal,
  cardTotal,
  salesTotal,
  onCorrect,
  onVoid,
}: Props) {
  return (
    <DataTable wide>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Date</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Cash</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Card</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Total</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {items.map((row) => (
          <DataTableRow key={row.id}>
            <DataTableCell>
              {isPendingReviewStatus(row.status) ? (
                <Link
                  href={`/sales/${row.id}`}
                  className="text-primary hover:underline"
                >
                  {row.summary_date ? formatTrDate(row.summary_date) : "—"}
                </Link>
              ) : row.summary_date ? (
                formatTrDate(row.summary_date)
              ) : (
                "—"
              )}
            </DataTableCell>
            <DataTableCell align="right" className="text-success">
              {formatTry(row.cash_kurus)}
            </DataTableCell>
            <DataTableCell align="right" className="text-primary">
              {formatTry(row.card_kurus)}
            </DataTableCell>
            <DataTableCell align="right" className="font-bold text-foreground">
              {formatTry(row.total_kurus)}
            </DataTableCell>
            <DataTableCell>
              <StatusBadge status={row.status} />
              {row.review_reason && isPendingReviewStatus(row.status) && (
                <p className="mt-1 max-w-xs truncate text-xs text-warning">
                  {row.review_reason}
                </p>
              )}
            </DataTableCell>
            <DataTableCell align="right">
              {row.status === "posted" ? (
                <PosDailySalesPostedActions
                  row={row}
                  grants={grants}
                  onCorrect={() => onCorrect(row)}
                  onVoid={() => onVoid(row)}
                />
              ) : isPendingReviewStatus(row.status) ? (
                <Link
                  href={`/sales/${row.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  Review
                </Link>
              ) : null}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
      {showPeriodTotals && (
        <DataTableFoot>
          <DataTableRow data-testid="sales-period-totals-row">
            <DataTableCell className="font-bold text-foreground">
              Total
            </DataTableCell>
            <DataTableCell align="right" className="font-medium text-success">
              {formatTry(cashTotal)}
            </DataTableCell>
            <DataTableCell align="right" className="font-medium text-primary">
              {formatTry(cardTotal)}
            </DataTableCell>
            <DataTableCell
              align="right"
              className="font-bold text-foreground"
            >
              {formatTry(salesTotal)}
            </DataTableCell>
            <DataTableCell>{null}</DataTableCell>
            <DataTableCell>{null}</DataTableCell>
          </DataTableRow>
        </DataTableFoot>
      )}
    </DataTable>
  );
}

export function SalesReviewMobileList({
  items,
  grants,
  onCorrect,
  onVoid,
}: Omit<Props, "showPeriodTotals" | "cashTotal" | "cardTotal" | "salesTotal">) {
  return (
    <MobileCardList>
      {items.map((row) => (
        <MobileCardRow
          key={row.id}
          href={`/sales/${row.id}`}
          title={row.summary_date ? formatTrDate(row.summary_date) : "—"}
          meta={<StatusBadge status={row.status} />}
          amount={formatTry(row.total_kurus)}
          trailing={
            row.status === "posted" ? (
              <div
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <PosDailySalesPostedActions
                  row={row}
                  grants={grants}
                  compact
                  onCorrect={() => onCorrect(row)}
                  onVoid={() => onVoid(row)}
                />
              </div>
            ) : isPendingReviewStatus(row.status) ? (
              <span className="text-xs text-primary">Review</span>
            ) : null
          }
        />
      ))}
    </MobileCardList>
  );
}
