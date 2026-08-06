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
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  partnerBalanceHeading,
  formatPartnerNetBalance,
} from "@/lib/partner-balance";
import { partnerMovementLabels } from "@/lib/subledger-labels";
import {
  subledgerRowClassName,
  type SubledgerDisplayKind,
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
} from "@/lib/partner-ledger-view";
import { partnerLedgerRowActions } from "@/lib/subledger-actions";
import { useLedgerHistoryView } from "@/lib/use-ledger-history-view";

type LedgerEntry = {
  id: string;
  movement_date: string;
  movement_type: string;
  amount_kurus: number;
  description: string;
  journal_entry_id: string | null;
  payment_account_id: string | null;
  /** Tells a drawing the partner took in cash from one created by a personal
   * expense split — the two read very differently to an owner. */
  reference_type?: string | null;
  display_kind: SubledgerDisplayKind;
  was_corrected?: boolean;
  running_balance_kurus?: number | null;
};

type LedgerResponse = {
  balance_kurus: number;
  capital_balance_kurus: number;
  capital_contribution_kurus: number;
  profit_allocated_kurus: number;
  unpaid_profit_kurus?: number;
  drawings_net_kurus: number;
  net_balance_kurus: number;
  loan_balance_kurus?: number;
  entries: LedgerEntry[];
};

export default function PartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const partnerId = params.id;
  const { entityId } = useEntity();

  const [partner, setPartner] = useState<PartnerRow | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
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

  const resetDetailState = useCallback(() => {
    setPartner(null);
    setLedger(null);
    setLoading(true);
    setError(null);
    setEditOpen(false);
    setRecordOpen(false);
    setPayProfitOpen(false);
    setCorrectEntry(null);
    setVoidTarget(null);
  }, []);

  useEntitySwitchReset(entityId, resetDetailState);

  const reload = useCallback(async () => {
    if (!entityId || !partnerId) return;
    setLoading(true);
    setError(null);
    try {
      const [part, led] = await Promise.all([
        apiFetch<PartnerRow>(`/entities/${entityId}/partners/${partnerId}`),
        apiFetch<LedgerResponse>(
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
  const cashSummary = useMemo(
    () =>
      partnerCashSummary(rows, {
        drawingsNetKurus: ledger?.drawings_net_kurus,
        capitalContributionKurus: ledger?.capital_contribution_kurus,
        capitalBalanceKurus: ledger?.capital_balance_kurus,
        reimbursementBalanceKurus: ledger?.balance_kurus,
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
              label={partnerBalanceHeading(ledger.net_balance_kurus)}
              amountKurus={Math.abs(ledger.net_balance_kurus)}
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
                      const actions = partnerLedgerRowActions(
                        entry.movement_type,
                      );
                      const canAct = actions.canEdit || actions.canVoid;
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
                                showEdit={actions.canEdit}
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
