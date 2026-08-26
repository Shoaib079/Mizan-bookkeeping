"use client";

/** Customer detail ledger table — DESIGN_ARCHETYPES §2 activity slot. */

import {
  CustomerLedgerRowActions,
  type CustomerLedgerEditTarget,
  type CustomerLedgerVoidTarget,
} from "@/components/customers/customer-ledger-row-actions";
import {
  formatLedgerGroupMeta,
  type CustomerLedgerEntry,
} from "@/components/customers/customer-detail-ledger-helpers";
import { EditedBadge } from "@/components/ledger/corrected-badge";
import { DetailSection } from "@/components/page/entity-detail-page";
import { LedgerTable } from "@/components/page/ledger-table";
import {
  DataTableCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import { subledgerRowClassName } from "@/lib/ledger-display";
import {
  moneyAmountClassName,
  moneyLeadingIcon,
} from "@/lib/mobile-ledger-card";
import { formatTrDate, formatTry } from "@/lib/money";
import { customerMovementLabels } from "@/lib/subledger-labels";

export type CustomerDetailLedgerProps = {
  entries: CustomerLedgerEntry[];
  visibleRows: CustomerLedgerEntry[];
  hiddenCount: number;
  showHistory: boolean;
  onToggleHistory: (next: boolean) => void;
  onEdit: (target: CustomerLedgerEditTarget) => void;
  onVoid: (target: CustomerLedgerVoidTarget) => void;
};

function typeLabel(entry: CustomerLedgerEntry): string {
  return customerMovementLabels[entry.movement_type] ?? entry.movement_type;
}

export function CustomerDetailLedger({
  entries,
  visibleRows,
  hiddenCount,
  showHistory,
  onToggleHistory,
  onEdit,
  onVoid,
}: CustomerDetailLedgerProps) {
  return (
    <DetailSection title="Ledger">
      <LedgerTable
        columns={[
          { key: "date", label: "Date" },
          { key: "type", label: "Type" },
          { key: "description", label: "Description" },
          { key: "pax", label: "Pax / forex" },
          { key: "amount", label: "Amount", align: "right" },
          { key: "balance", label: "Balance", align: "right" },
        ]}
        hasActions
        isEmpty={entries.length === 0}
        isFiltered={visibleRows.length === 0}
        history={{
          hiddenCount,
          showHistory,
          onToggle: onToggleHistory,
        }}
        mobile={
          <MobileCardList>
            {visibleRows.map((entry) => (
              <MobileCardRow
                key={entry.id}
                title={entry.description}
                meta={
                  <>
                    <span>{typeLabel(entry)}</span>
                    <span>·</span>
                    <span>{formatTrDate(entry.movement_date)}</span>
                    {formatLedgerGroupMeta(entry) && (
                      <span>{formatLedgerGroupMeta(entry)}</span>
                    )}
                    {entry.was_corrected && <EditedBadge />}
                  </>
                }
                amount={formatTry(entry.amount_kurus)}
                amountClassName={moneyAmountClassName(entry.amount_kurus)}
                leadingIcon={moneyLeadingIcon(entry.amount_kurus)}
                trailing={
                  <CustomerLedgerRowActions
                    row={entry}
                    onEdit={onEdit}
                    onVoid={onVoid}
                  />
                }
              />
            ))}
          </MobileCardList>
        }
      >
        {visibleRows.map((entry) => (
          <DataTableRow
            key={entry.id}
            className={subledgerRowClassName(entry.display_kind)}
          >
            <DataTableCell>
              {formatTrDate(entry.movement_date)}
            </DataTableCell>
            <DataTableCell>{typeLabel(entry)}</DataTableCell>
            <DataTableCell>
              {entry.description}
              {entry.was_corrected && (
                <span className="ml-2">
                  <EditedBadge />
                </span>
              )}
            </DataTableCell>
            <DataTableCell className="text-sm text-muted-foreground">
              {formatLedgerGroupMeta(entry) ?? "—"}
            </DataTableCell>
            <DataTableCell align="right">
              {formatTry(entry.amount_kurus)}
            </DataTableCell>
            <DataTableCell align="right">
              {entry.running_balance_kurus != null
                ? formatTry(entry.running_balance_kurus)
                : "—"}
            </DataTableCell>
            <DataTableCell align="right">
              <CustomerLedgerRowActions
                row={entry}
                onEdit={onEdit}
                onVoid={onVoid}
              />
            </DataTableCell>
          </DataTableRow>
        ))}
      </LedgerTable>
    </DetailSection>
  );
}
