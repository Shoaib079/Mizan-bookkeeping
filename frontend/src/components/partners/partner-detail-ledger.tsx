import { Fragment } from "react";

import { SubledgerActionsCell } from "@/components/ledger/subledger-actions-cell";
import { ActionsUnavailableNotice } from "@/components/ledger/actions-unavailable-notice";
import { EditedBadge } from "@/components/ledger/corrected-badge";
import { LedgerBandHeading } from "@/components/ledger/ledger-band-heading";
import { DetailSection } from "@/components/page/entity-detail-page";
import { LedgerTable } from "@/components/page/ledger-table";
import { FilterChips } from "@/components/page/filter-chips";
import {
  DataTableCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { entityPath } from "@/lib/api";
import type { GlEditTarget } from "@/components/ledger/gl-edit-dialogs";
import { editTargetFor } from "@/lib/gl-edit-target";
import { subledgerRowClassName } from "@/lib/ledger-display";
import {
  ledgerVoidConfirmDetail,
  partnerMovementTypeLabel,
} from "@/lib/ledger-void-confirm-detail";
import { formatTrDate, formatTry } from "@/lib/money";
import { formatPartnerNetBalance } from "@/lib/partner-balance";
import {
  PARTNER_LEDGER_FILTERS,
  type LedgerBand,
  type PartnerLedgerEntry,
  type PartnerLedgerFilter,
} from "@/lib/partner-ledger-view";
import type { EntryActions } from "@/lib/use-entry-actions";

type Props = {
  bands: LedgerBand<PartnerLedgerEntry>[];
  hiddenCount: number;
  showHistory: boolean;
  onToggleHistory: (next: boolean) => void;
  ledgerFilter: PartnerLedgerFilter;
  onLedgerFilterChange: (value: PartnerLedgerFilter) => void;
  actionsFailed: boolean;
  onRetryActions: () => void;
  isEmpty: boolean;
  isFiltered: boolean;
  entityId: string;
  opensEditKinds: readonly string[];
  rowActions: (journalEntryId: string | null) => EntryActions;
  onEditTarget: (target: GlEditTarget) => void;
  onVoidTarget: (target: { path: string; description: string }) => void;
};

export function PartnerDetailLedger({
  bands,
  hiddenCount,
  showHistory,
  onToggleHistory,
  ledgerFilter,
  onLedgerFilterChange,
  actionsFailed,
  onRetryActions,
  isEmpty,
  isFiltered,
  entityId,
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
        history={{ hiddenCount, showHistory, onToggle: onToggleHistory }}
        notice={
          actionsFailed && <ActionsUnavailableNotice onRetry={onRetryActions} />
        }
        controls={
          <FilterChips
            chips={PARTNER_LEDGER_FILTERS}
            value={ledgerFilter}
            onChange={onLedgerFilterChange}
            ariaLabel="Filter ledger by movement"
          />
        }
      >
        {bands.map((band) => (
          <Fragment key={band.key}>
            {band.title && (
              <LedgerBandHeading
                title={band.title}
                grossKurus={band.grossKurus}
                hasParts={band.rows.length > 1}
                leadingColumns={3}
                trailingColumns={2}
              />
            )}
            {band.rows.map((entry) => {
              const asked = rowActions(entry.journal_entry_id);
              return (
                <DataTableRow
                  key={entry.id}
                  className={subledgerRowClassName(entry.display_kind)}
                >
                  <DataTableCell>
                    {formatTrDate(entry.movement_date)}
                  </DataTableCell>
                  <DataTableCell className={band.title ? "pl-8" : undefined}>
                    {partnerMovementTypeLabel(entry.movement_type, band.title)}
                  </DataTableCell>
                  <DataTableCell>
                    <span>{entry.description}</span>
                    {entry.subject_name && (
                      <span className="ml-2 text-muted-foreground">
                        · {entry.subject_name}
                      </span>
                    )}
                    {entry.was_corrected && (
                      <span className="ml-2">
                        <EditedBadge />
                      </span>
                    )}
                  </DataTableCell>
                  <DataTableCell align="right">
                    {formatTry(entry.amount_kurus)}
                  </DataTableCell>
                  <DataTableCell align="right">
                    {entry.running_balance_kurus != null
                      ? formatPartnerNetBalance(entry.running_balance_kurus)
                      : "—"}
                  </DataTableCell>
                  <DataTableCell>
                    <SubledgerActionsCell
                      row={entry}
                      actions={asked}
                      opensEditKinds={opensEditKinds}
                      ownerNoun="partners"
                      voidConfirmDetail={ledgerVoidConfirmDetail({
                        date: entry.movement_date,
                        type: partnerMovementTypeLabel(
                          entry.movement_type,
                          band.title,
                        ),
                        amount: formatTry(entry.amount_kurus),
                        description: entry.description,
                      })}
                      onEdit={(edit) =>
                        onEditTarget(
                          editTargetFor(
                            edit.kind,
                            edit.context,
                            entry.journal_entry_id!,
                          )!,
                        )
                      }
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
          </Fragment>
        ))}
      </LedgerTable>
    </DetailSection>
  );
}
