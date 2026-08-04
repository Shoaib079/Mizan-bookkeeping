"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { PartnerRecordForm } from "@/components/forms/partner-record-form";
import { EditedBadge } from "@/components/ledger/corrected-badge";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { LedgerHistoryToggle } from "@/components/ledger/ledger-history-toggle";
import {
  CorrectPartnerLedgerForm,
  type CorrectablePartnerLedgerRow,
} from "@/components/forms/correct-partner-ledger-form";
import { PartnerForm, type PartnerRow } from "@/components/forms/partner-form";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  partnerBalanceAmount,
  partnerBalanceHeading,
  formatPartnerNetBalance,
} from "@/lib/partner-balance";
import { partnerMovementLabels } from "@/lib/subledger-labels";
import {
  subledgerRowClassName,
  type SubledgerDisplayKind,
} from "@/lib/ledger-display";
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
  const [correctEntry, setCorrectEntry] = useState<CorrectablePartnerLedgerRow | null>(null);
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

  const {
    showHistory,
    setShowHistory,
    hiddenCount,
    visibleRows,
  } = useLedgerHistoryView(ledger?.entries ?? []);

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
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading partner…</p>
      )}

      {!loading && partner && ledger && (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold">{partner.name}</h1>
                <Button
                  type="button"
                  className="h-8"
                  onClick={() => setEditOpen(true)}
                >
                  Edit
                </Button>
              </div>
              <StatusBadge status={partner.is_active ? "active" : "inactive"} />
              {partner.ownership_share_pct != null && (
                <span className="text-sm text-muted-foreground">
                  Share: {partner.ownership_share_pct}%
                </span>
              )}
              {partner.notes && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {partner.notes}
                </p>
              )}
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">
                {partnerBalanceHeading(ledger.net_balance_kurus)}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {partnerBalanceAmount(ledger.net_balance_kurus)}
              </p>
              {(ledger.balance_kurus !== 0 ||
                ledger.capital_contribution_kurus !== 0 ||
                ledger.profit_allocated_kurus !== 0 ||
                (ledger.loan_balance_kurus ?? 0) !== 0) && (
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {ledger.balance_kurus !== 0 && (
                    <p>
                      Fronted expenses: {formatTry(ledger.balance_kurus)}
                    </p>
                  )}
                  {ledger.capital_contribution_kurus !== 0 && (
                    <p>
                      Capital contributed:{" "}
                      {formatTry(ledger.capital_contribution_kurus)}
                    </p>
                  )}
                  {ledger.profit_allocated_kurus !== 0 && (
                    <p>
                      Profit allocated:{" "}
                      {formatTry(ledger.profit_allocated_kurus)}
                    </p>
                  )}
                  {(ledger.profit_allocated_kurus !== 0 ||
                    (ledger.unpaid_profit_kurus ?? 0) !== 0) && (
                    <p>
                      Unpaid profit:{" "}
                      {formatTry(ledger.unpaid_profit_kurus ?? 0)}
                    </p>
                  )}
                  {(ledger.loan_balance_kurus ?? 0) !== 0 && (
                    <p>
                      Partner loan: {formatTry(ledger.loan_balance_kurus!)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            <Button type="button" onClick={() => setRecordOpen(true)}>
              Record
            </Button>
            <Button
              type="button"
              disabled={(ledger.unpaid_profit_kurus ?? 0) <= 0}
              onClick={() => setPayProfitOpen(true)}
              title={
                (ledger.unpaid_profit_kurus ?? 0) <= 0
                  ? "No unpaid allocated profit — allocate on the Partners list first"
                  : undefined
              }
            >
              Pay profit
            </Button>
          </div>

          <h2 className="mb-2 text-sm font-semibold">Ledger</h2>
          <LedgerHistoryToggle
            hiddenCount={hiddenCount}
            showHistory={showHistory}
            onToggle={setShowHistory}
          />
          {ledger.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No movements yet.</p>
          ) : visibleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No current entries — show correction history to see voided rows.
            </p>
          ) : (
            <DataTable>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Date</DataTableHeaderCell>
                  <DataTableHeaderCell>Type</DataTableHeaderCell>
                  <DataTableHeaderCell>Description</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Balance</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {visibleRows.map((entry) => {
                  const actions = partnerLedgerRowActions(entry.movement_type);
                  const canAct = actions.canEdit || actions.canVoid;
                  return (
                    <DataTableRow
                      key={entry.id}
                      className={subledgerRowClassName(entry.display_kind)}
                    >
                      <DataTableCell>
                        {formatTrDate(entry.movement_date)}
                      </DataTableCell>
                      <DataTableCell>
                        {partnerMovementLabels[entry.movement_type] ??
                          entry.movement_type}
                      </DataTableCell>
                      <DataTableCell>
                        <span>{entry.description}</span>
                        {entry.was_corrected && (
                          <span className="ml-2">
                            <EditedBadge />
                          </span>
                        )}
                        {canAct && (
                          <SubledgerRowActions
                            inline
                            row={entry}
                            showEdit={actions.canEdit}
                            onEdit={() =>
                              setCorrectEntry({
                                journal_entry_id: entry.journal_entry_id!,
                                movement_date: entry.movement_date,
                                movement_type: entry.movement_type,
                                amount_kurus: entry.amount_kurus,
                                description: entry.description,
                                payment_account_id: entry.payment_account_id,
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
                      <DataTableCell align="right">
                        {formatTry(entry.amount_kurus)}
                      </DataTableCell>
                      <DataTableCell align="right">
                        {entry.running_balance_kurus != null
                          ? formatPartnerNetBalance(entry.running_balance_kurus)
                          : "—"}
                      </DataTableCell>
                    </DataTableRow>
                  );
                })}
              </DataTableBody>
            </DataTable>
          )}

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
            capitalBalanceKurus={ledger.capital_balance_kurus}
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
    </AppShell>
  );
}
