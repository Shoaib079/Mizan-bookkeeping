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
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import {
  CorrectPartnerLedgerForm,
  type CorrectablePartnerLedgerRow,
} from "@/components/forms/correct-partner-ledger-form";
import { PartnerForm, type PartnerRow } from "@/components/forms/partner-form";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  DataTableCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  partnerBalance,
  partnerBalanceHeading,
  formatPartnerNetBalance,
} from "@/lib/partner-balance";
import { partnerMovementLabels } from "@/lib/subledger-labels";
import {
  subledgerRowClassName,
} from "@/lib/ledger-display";
import {
  PartnerCashCard,
  PartnerProfitCard,
} from "@/components/partners/partner-summary-cards";
import {
  partnerCashSummary,
  partnerProfitSummary,
} from "@/lib/partner-summary";
import {
  PARTNER_LEDGER_FILTERS,
  allocationRowLabel,
  groupPartnerLedgerRows,
  partnerLedgerFilterMatches,
  type PartnerLedgerFilter,
  type PartnerLedgerResponse,
} from "@/lib/partner-ledger-view";
import {
  actionsForOneOwnersRow,
  useEntryActions,
} from "@/lib/use-entry-actions";
import { useLedgerHistoryView } from "@/lib/use-ledger-history-view";

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
  const [voidTarget, setVoidTarget] = useState<{
    journal_entry_id: string;
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

  const rows = useMemo(() => ledger?.entries ?? [], [ledger]);
  const profitSummary = useMemo(
    () => partnerProfitSummary(rows, ledger?.unpaid_profit_kurus),
    [rows, ledger?.unpaid_profit_kurus],
  );
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
  // One request for the rows on screen, rather than a rule kept here that has
  // to agree with the backend's.
  const { rowActions } = useEntryActions(
    entityId,
    useMemo(
      () =>
        filteredRows
          .map((entry) => entry.journal_entry_id)
          .filter((id): id is string => Boolean(id)),
      [filteredRows],
    ),
  );
  const cashSummary = useMemo(
    () =>
      partnerCashSummary(rows, {
        drawingsNetKurus: ledger?.drawings_net_kurus,
        capitalContributionKurus: ledger?.capital_contribution_kurus,
        capitalBalanceKurus: ledger?.capital_balance_kurus,
        reimbursementBalanceKurus: ledger?.balance_kurus,
        currentAccountKurus: ledger ? partnerBalance(ledger) : undefined,
      }),
    [rows, ledger],
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
              caption={
                (ledger.loan_balance_kurus ?? 0) !== 0
                  ? `Partner loan: ${formatTry(ledger.loan_balance_kurus!)}`
                  : undefined
              }
            />
          )
        }
        /* Profit and cash reported separately — one sticker each. */
        panels={
          ledger && (
            <>
              <PartnerProfitCard profit={profitSummary} />
              <PartnerCashCard cash={cashSummary} />
            </>
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
                      // The gross share the partner earned. The rows beneath
                      // are how it was applied, so they read as its breakdown
                      // rather than as two unrelated amounts.
                      <tr className="bg-muted/40">
                        <td
                          colSpan={3}
                          className="px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-primary"
                        >
                          {band.title}
                          {band.rows.length > 1 && (
                            <span className="ml-2 normal-case tracking-normal text-muted-foreground">
                              — share applied as follows
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-1.5 text-right text-sm font-semibold tabular-nums text-primary">
                          {band.grossKurus != null && formatTry(band.grossKurus)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    )}
                    {band.rows.map((entry) => {
                      // Asked, not decided here. The page used to key on
                      // movement type, which does not always describe the
                      // entry: a personal expense split writes a `drawing`
                      // whose other leg this page knows nothing about.
                      const actions = actionsForOneOwnersRow(
                        rowActions(entry.journal_entry_id),
                      );
                      const canAct = actions.can_edit || actions.can_void;
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
                            {canAct && (
                              <SubledgerRowActions
                                row={entry}
                                showEdit={actions.can_edit}
                                onEdit={() =>
                                  setCorrectEntry({
                                    journal_entry_id: entry.journal_entry_id!,
                                    movement_date: entry.movement_date,
                                    movement_type: entry.movement_type,
                                    amount_kurus: entry.amount_kurus,
                                    description: entry.description,
                                    payment_account_id:
                                      entry.payment_account_id,
                                  })
                                }
                                onVoid={() =>
                                  setVoidTarget({
                                    journal_entry_id: entry.journal_entry_id!,
                                    description: entry.description,
                                  })
                                }
                              />
                            )}
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
              netBalanceKurus={ledger.net_balance_kurus}
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
              voidPath={
                entityId && voidTarget
                  ? `/entities/${entityId}/partners/${partnerId}/ledger/${voidTarget.journal_entry_id}/void`
                  : null
              }
              onClose={() => setVoidTarget(null)}
              onSaved={() => void reload()}
            />
          </>
        )}
      </EntityDetailPage>
    </AppShell>
  );
}
