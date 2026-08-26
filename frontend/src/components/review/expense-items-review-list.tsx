"use client";

/** Expense items list — desktop table / phone cards. */

import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import type { ExpenseItemRow } from "@/lib/expense-item-merge";
import {
  moneyAmountClassName,
  moneyLeadingIcon,
} from "@/lib/mobile-ledger-card";
import { formatTry } from "@/lib/money";
import { cn } from "@/lib/utils";

export type ExpenseItemListRow = ExpenseItemRow & {
  postedTotalKurus: number;
};

type Props = {
  rows: ExpenseItemListRow[];
  highlightItemId: string | null;
  isMobile: boolean;
  onDrillDown: (itemId: string, itemName: string) => void;
};

export function ExpenseItemsReviewList({
  rows,
  highlightItemId,
  isMobile,
  onDrillDown,
}: Props) {
  if (isMobile) {
    return (
      <MobileCardList>
        {rows.map((item) => {
          const signed =
            item.postedTotalKurus > 0
              ? -Math.abs(item.postedTotalKurus)
              : 0;
          return (
            <MobileCardRow
              key={item.id}
              title={
                <span id={`item-${item.id}`}>{item.canonical_name}</span>
              }
              onClick={() => onDrillDown(item.id, item.canonical_name)}
              meta={
                <>
                  <span>{item.is_active ? "Active" : "Inactive"}</span>
                  {highlightItemId === item.id && (
                    <span className="text-primary">Highlighted</span>
                  )}
                </>
              }
              amount={
                item.postedTotalKurus > 0
                  ? formatTry(item.postedTotalKurus)
                  : "—"
              }
              amountClassName={
                item.postedTotalKurus > 0
                  ? moneyAmountClassName(signed)
                  : undefined
              }
              leadingIcon={
                item.postedTotalKurus > 0
                  ? moneyLeadingIcon(signed)
                  : undefined
              }
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
          <DataTableHeaderCell>Name</DataTableHeaderCell>
          <DataTableHeaderCell align="right">
            Posted in period
          </DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {rows.map((item) => (
          <DataTableRow
            key={item.id}
            id={`item-${item.id}`}
            className={cn(
              "cursor-pointer hover:bg-muted/50",
              highlightItemId === item.id && "bg-muted/60",
            )}
            onClick={() => onDrillDown(item.id, item.canonical_name)}
          >
            <DataTableCell>{item.canonical_name}</DataTableCell>
            <DataTableCell align="right">
              {item.postedTotalKurus > 0
                ? formatTry(item.postedTotalKurus)
                : "—"}
            </DataTableCell>
            <DataTableCell>
              {item.is_active ? "Active" : "Inactive"}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
