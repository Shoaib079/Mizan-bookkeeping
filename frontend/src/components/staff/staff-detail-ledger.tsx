import { SubledgerActionsCell } from "@/components/ledger/subledger-actions-cell";
import { ActionsUnavailableNotice } from "@/components/ledger/actions-unavailable-notice";
import { EditedBadge } from "@/components/ledger/corrected-badge";
import { DetailSection } from "@/components/page/entity-detail-page";
import { LedgerTable } from "@/components/page/ledger-table";
import {
  DataTableCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { entityPath } from "@/lib/api";
import type { GlEditTarget } from "@/components/ledger/gl-edit-dialogs";
import { editTargetFor } from "@/lib/gl-edit-target";
import { subledgerRowClassName, type SubledgerDisplayKind } from "@/lib/ledger-display";
import {
  ledgerVoidConfirmDetail,
  staffMovementTypeLabel,
} from "@/lib/ledger-void-confirm-detail";
import { formatTrDate } from "@/lib/money";
import { extraDaysLabel, salaryPeriodLabel } from "@/lib/staff-ledger-labels";
import type { StaffDisplayRow } from "@/lib/staff-ledger-display";
import { staffMovementLabels } from "@/lib/subledger-labels";
import type { EntryActions } from "@/lib/use-entry-actions";

type StaffLedgerEntry = {
  id: string;
  movement_date: string;
  movement_type: string;
  amount_minor: number;
  description: string;
  journal_entry_id: string | null;
  display_kind: SubledgerDisplayKind;
  was_corrected?: boolean;
  period_year?: number | null;
  period_month?: number | null;
  extra_days?: number | null;
};

type Props = {
  displayRows: StaffDisplayRow<StaffLedgerEntry>[];
  isEmpty: boolean;
  isFiltered: boolean;
  hiddenCount: number;
  showHistory: boolean;
  onToggleHistory: (next: boolean) => void;
  actionsFailed: boolean;
  onRetryActions: () => void;
  entityId: string;
  formatMinorAmount: (minor: number) => string;
  opensEditKinds: readonly string[];
  rowActions: (journalEntryId: string | null) => EntryActions;
  onEditTarget: (target: GlEditTarget) => void;
  onVoidTarget: (target: { path: string; description: string }) => void;
};

export function StaffDetailLedger({
  displayRows,
  isEmpty,
  isFiltered,
  hiddenCount,
  showHistory,
  onToggleHistory,
  actionsFailed,
  onRetryActions,
  entityId,
  formatMinorAmount,
  opensEditKinds,
  rowActions,
  onEditTarget,
  onVoidTarget,
}: Props) {
  return (
    <DetailSection title="Ledger">
      <LedgerTable
        columns={[
          { key: "date", label: "Date" },
          { key: "type", label: "Type" },
          { key: "description", label: "Description" },
          { key: "amount", label: "Amount", align: "right" },
          { key: "balance", label: "Balance", align: "right" },
        ]}
        hasActions
        isEmpty={isEmpty}
        isFiltered={isFiltered}
        notice={
          actionsFailed && <ActionsUnavailableNotice onRetry={onRetryActions} />
        }
        history={{ hiddenCount, showHistory, onToggle: onToggleHistory }}
        filteredMessage="No current entries in this period — show correction history to see voided rows."
      >
        {displayRows.map((group) => {
          const entry = group.primary;
          const asked = rowActions(entry.journal_entry_id);
          return (
            <DataTableRow
              key={entry.id}
              className={subledgerRowClassName(entry.display_kind)}
            >
              <DataTableCell>
                {formatTrDate(entry.movement_date)}
              </DataTableCell>
              <DataTableCell>
                {group.isAdvanceOffset
                  ? "Advance applied"
                  : (staffMovementLabels[entry.movement_type] ??
                    entry.movement_type)}
                {!group.isAdvanceOffset && salaryPeriodLabel(entry) && (
                  <span className="ml-1 text-muted-foreground">
                    ({salaryPeriodLabel(entry)})
                  </span>
                )}
                {extraDaysLabel(entry) && (
                  <span className="ml-1 text-muted-foreground">
                    ({extraDaysLabel(entry)})
                  </span>
                )}
              </DataTableCell>
              <DataTableCell>
                {group.isAdvanceOffset
                  ? "Advance applied to salary"
                  : entry.description}
                {group.advanceAppliedMinor > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {group.isAdvanceOffset
                      ? `${formatMinorAmount(group.advanceAppliedMinor)} from advance — no cash`
                      : `incl. ${formatMinorAmount(group.advanceAppliedMinor)} from advance`}
                  </span>
                )}
                {group.advanceCreatedMinor > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    incl. {formatMinorAmount(group.advanceCreatedMinor)} held as
                    advance
                  </span>
                )}
                {entry.was_corrected && (
                  <span className="ml-2">
                    <EditedBadge />
                  </span>
                )}
              </DataTableCell>
              <DataTableCell align="right">
                {formatMinorAmount(group.netMinor)}
              </DataTableCell>
              <DataTableCell
                align="right"
                className="tabular-nums text-muted-foreground"
              >
                {group.balanceMinor === null
                  ? "—"
                  : formatMinorAmount(group.balanceMinor)}
              </DataTableCell>
              <DataTableCell>
                <SubledgerActionsCell
                  row={entry}
                  actions={asked}
                  opensEditKinds={opensEditKinds}
                  ownerNoun="employees"
                  voidConfirmDetail={ledgerVoidConfirmDetail({
                    date: entry.movement_date,
                    type: staffMovementTypeLabel(
                      entry.movement_type,
                      group.isAdvanceOffset,
                    ),
                    amount: formatMinorAmount(group.netMinor),
                    description: entry.description,
                  })}
                  onEdit={(edit) => {
                    const target = editTargetFor(
                      edit.kind,
                      edit.context,
                      entry.journal_entry_id!,
                    );
                    if (target) onEditTarget(target);
                  }}
                  onVoid={(voidPath) =>
                    onVoidTarget({
                      path: entityPath(entityId, voidPath),
                      description: entry.description,
                    })
                  }
                />
              </DataTableCell>
            </DataTableRow>
          );
        })}
      </LedgerTable>
    </DetailSection>
  );
}
