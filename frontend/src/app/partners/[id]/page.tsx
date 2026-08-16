"use client";

/** Partner detail — DESIGN_ARCHETYPES §2 (`EntityDetailPage`). */

import { useParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import {
  DetailSection,
  EntityDetailPage,
} from "@/components/page/entity-detail-page";
import { FilterChips } from "@/components/page/filter-chips";
import { LedgerTable } from "@/components/page/ledger-table";
import { EditTitleButton, MetaFacts } from "@/components/page/page-header";
import { HeadlineFigure } from "@/components/page/summary-panel";
import { PartnerRecordForm } from "@/components/forms/partner-record-form";
import { SubledgerDownloadMenu } from "@/components/ledger/subledger-download-menu";
import { EditedBadge } from "@/components/ledger/corrected-badge";
import { ActionsUnavailableNotice } from "@/components/ledger/actions-unavailable-notice";
import { LedgerBandHeading } from "@/components/ledger/ledger-band-heading";
import { SubledgerActionsCell } from "@/components/ledger/subledger-actions-cell";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import {
  CorrectPartnerLedgerForm,
  type CorrectablePartnerLedgerRow,
} from "@/components/forms/correct-partner-ledger-form";
import {
  CorrectPartnerProfitAllocationForm,
  type CorrectableProfitAllocationRow,
} from "@/components/forms/correct-partner-profit-allocation-form";
import { PartnerForm, type PartnerRow } from "@/components/forms/partner-form";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { DataTableCell, DataTableRow } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch, entityPath } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  partnerBalance,
  partnerBalanceHeading,
  partnerHeadlineCaption,
  formatPartnerNetBalance,
} from "@/lib/partner-balance";
import { partnerMovementLabels } from "@/lib/subledger-labels";
import { subledgerRowClassName } from "@/lib/ledger-display";
import {
  PARTNER_LEDGER_FILTERS,
  allocationRowFrom,
  allocationRowLabel,
  groupPartnerLedgerRows,
  partnerLedgerFilterMatches,
  type PartnerLedgerFilter,
  type PartnerLedgerResponse,
} from "@/lib/partner-ledger-view";
import { useEntryActions } from "@/lib/use-entry-actions";
import { useLedgerHistoryView } from "@/lib/use-ledger-history-view";

/** The correction forms this page has. Anything else the backend offers is
 * opened from the General ledger, which has the rest.
 *
 * An allocation is only ever offered here when it covers a single partner —
 * `owner_count` decides that, upstream of this list. Editing one that covers
 * several from one partner's row would change everybody's share. */
const PAGE_EDIT_KINDS = ["partner_ledger", "partner_profit_allocation"] as const;

export default function PartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const partnerId = params.id;
  const { entityId } = useEntity();

  const [partner, setPartner] = useState<PartnerRow | null>(null);
  const [ledger, setLedger] = useState<PartnerLedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [payProfitOpen, setPayProfitOpen] = useState(false);
  const [correctEntry, setCorrectEntry] =
    useState<CorrectablePartnerLedgerRow | null>(null);
  const [correctAllocation, setCorrectAllocation] =
    useState<CorrectableProfitAllocationRow | null>(null);
  // The path comes from the backend rather than being rebuilt here. A profit
  // allocation voids at `partners/profit-allocation/{entry}/void`, not at the
  // partner-ledger route this page used to assume for every row.
  const [voidTarget, setVoidTarget] = useState<{
    path: string;
    description: string;
  } | null>(null);

  const reload = useCallback(async () => {
    if (!entityId || !partnerId) return;
    setLoading(true);
    setError(null);
    try {
      const [part, led] = await Promise.all([
        apiFetch<PartnerRow>(`/entities/${entityId}/partners/${partnerId}`),
        apiFetch<PartnerLedgerResponse>(
          `/entities/${entityId}/partners/${partnerId}/ledger`,
        ),
      ]);
      setPartner(part);
      setLedger(led);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, partnerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const { showHistory, setShowHistory, hiddenCount, visibleRows } =
    useLedgerHistoryView(ledger?.entries ?? []);

  const [ledgerFilter, setLedgerFilter] = useState<PartnerLedgerFilter>("all");
  const filteredRows = useMemo(
    () =>
      visibleRows.filter((entry) =>
        partnerLedgerFilterMatches(ledgerFilter, entry.movement_type),
      ),
    [visibleRows, ledgerFilter],
  );
  const bands = useMemo(
    () => groupPartnerLedgerRows(filteredRows),
    [filteredRows],
  );
  // Asked of the backend, never decided here. The ledger sends the verdicts
  // with its rows, so nothing is fetched and no button arrives late; the ids
  // are still passed for the fallback path against an older backend.
  const { rowActions, failed: actionsFailed, retry: retryActions } = useEntryActions(
    entityId,
    useMemo(
      () =>
        filteredRows
          .map((entry) => entry.journal_entry_id)
          .filter((id): id is string => Boolean(id)),
      [filteredRows],
    ),
    ledger?.entry_actions,
  );

  if (!entityId) {
    return (
      <AppShell title="Partner">
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title={partner?.name ?? "Partner"}>
      <EntityDetailPage
        title={partner?.name ?? "Partner"}
        loading={loading}
        error={error}
        meta={
          partner && (
            <MetaFacts
              items={[
                <StatusBadge
                  key="status"
                  status={partner.is_active ? "active" : "inactive"}
                />,
                partner.ownership_share_pct != null &&
                  `${partner.ownership_share_pct}% share`,
                partner.notes,
              ].filter(Boolean)}
            />
          )
        }
        primaryAction={
          <Button type="button" onClick={() => setRecordOpen(true)}>
            Record
          </Button>
        }
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={(ledger?.unpaid_profit_kurus ?? 0) <= 0}
              onClick={() => setPayProfitOpen(true)}
              title={
                (ledger?.unpaid_profit_kurus ?? 0) <= 0
                  ? "No unpaid allocated profit — allocate on the Partners list first"
                  : undefined
              }
            >
              Pay profit
            </Button>
            <SubledgerDownloadMenu
              basePath={
                entityId && partnerId
                  ? `/entities/${entityId}/partners/${partnerId}/ledger`
                  : null
              }
              disabled={loading}
            />
          </>
        }
        titleAction={<EditTitleButton onClick={() => setEditOpen(true)} />}
        headline={
          ledger && (
            <HeadlineFigure
              label={partnerBalanceHeading(partnerBalance(ledger))}
              amountKurus={Math.abs(partnerBalance(ledger))}
              caption={partnerHeadlineCaption(ledger)}
            />
          )
        }
        activity={
          ledger && (
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
                isEmpty={ledger.entries.length === 0}
                isFiltered={visibleRows.length === 0}
                history={{ hiddenCount, showHistory, onToggle: setShowHistory }}
                notice={
                  actionsFailed && (
                    <ActionsUnavailableNotice onRetry={retryActions} />
                  )
                }
                controls={
                  <FilterChips
                    chips={PARTNER_LEDGER_FILTERS}
                    value={ledgerFilter}
                    onChange={setLedgerFilter}
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
                      // Asked, not decided here. The page used to key on
                      // movement type, which does not always describe the
                      // entry: a personal expense split writes a `drawing`
                      // whose other leg this page knows nothing about.
                      const asked = rowActions(entry.journal_entry_id);
                      return (
                        <DataTableRow
                          key={entry.id}
                          className={subledgerRowClassName(entry.display_kind)}
                        >
                          <DataTableCell>
                            {formatTrDate(entry.movement_date)}
                          </DataTableCell>
                          <DataTableCell
                            className={band.title ? "pl-8" : undefined}
                          >
                            {(band.title &&
                              allocationRowLabel(entry.movement_type)) ??
                              partnerMovementLabels[entry.movement_type] ??
                              entry.movement_type}
                          </DataTableCell>
                          <DataTableCell>
                            <span>{entry.description}</span>
                            {/* Who or what it was for. The row has always
                             * recorded the reference; three salaries fronted
                             * in one week read alike until it was shown. */}
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
                              ? formatPartnerNetBalance(
                                  entry.running_balance_kurus,
                                )
                              : "—"}
                          </DataTableCell>
                          <DataTableCell>
                            <SubledgerActionsCell
                              row={entry}
                              actions={asked}
                              opensEditKinds={PAGE_EDIT_KINDS}
                              ownerNoun="partners"
                              onEdit={(edit) =>
                                edit.kind === "partner_profit_allocation"
                                  ? setCorrectAllocation(
                                      allocationRowFrom(
                                        entry.journal_entry_id!,
                                        edit.context,
                                      ),
                                    )
                                  : setCorrectEntry({
                                      journal_entry_id: entry.journal_entry_id!,
                                      movement_date: entry.movement_date,
                                      movement_type: entry.movement_type,
                                      amount_kurus: entry.amount_kurus,
                                      description: entry.description,
                                      payment_account_id: entry.payment_account_id,
                                    })
                              }
                              onVoid={(voidPath) =>
                                setVoidTarget({
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
          )
        }
      >
        {partner && ledger && (
          <>
            <PartnerForm
              open={editOpen}
              partner={partner}
              onClose={() => setEditOpen(false)}
              onSaved={() => void reload()}
            />
            <PartnerRecordForm
              open={recordOpen}
              partnerId={partnerId}
              netBalanceKurus={partnerBalance(ledger)}
              frontedBalanceKurus={ledger.balance_kurus}
              drawingsNetKurus={ledger.drawings_net_kurus}
              onClose={() => setRecordOpen(false)}
              onSaved={() => void reload()}
            />
            <PartnerRecordForm
              key="pay-profit"
              open={payProfitOpen}
              partnerId={partnerId}
              lockedKind="profit_paid"
              unpaidProfitKurus={ledger.unpaid_profit_kurus ?? 0}
              onClose={() => setPayProfitOpen(false)}
              onSaved={() => void reload()}
            />
            <CorrectPartnerProfitAllocationForm
              open={correctAllocation !== null}
              entry={correctAllocation}
              onClose={() => setCorrectAllocation(null)}
              onSaved={() => void reload()}
            />
            <CorrectPartnerLedgerForm
              open={correctEntry !== null}
              partnerId={partnerId}
              entry={correctEntry}
              onClose={() => setCorrectEntry(null)}
              onSaved={() => void reload()}
            />
            <VoidSubledgerDialog
              open={voidTarget !== null}
              title="Void partner movement"
              description={voidTarget?.description}
              voidPath={voidTarget?.path ?? null}
              onClose={() => setVoidTarget(null)}
              onSaved={() => void reload()}
            />
          </>
        )}
      </EntityDetailPage>
    </AppShell>
  );
}
