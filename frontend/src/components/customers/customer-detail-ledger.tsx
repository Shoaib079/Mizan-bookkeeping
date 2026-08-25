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
import { subledgerRowClassName } from "@/lib/ledger-display";
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
      >
        {visibleRows.map((entry) => (
          <DataTableRow
            key={entry.id}
            className={subledgerRowClassName(entry.display_kind)}
          >
            <DataTableCell>
              {formatTrDate(entry.movement_date)}
            </DataTableCell>
            <DataTableCell>
              {customerMovementLabels[entry.movement_type] ??
                entry.movement_type}
            </DataTableCell>
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
