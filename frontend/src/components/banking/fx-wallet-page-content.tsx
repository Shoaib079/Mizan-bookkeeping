"use client";

/** FX wallet — DESIGN_ARCHETYPES §2 (`EntityDetailPage`). */

import { Coins } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DetailSection,
  EntityDetailPage,
} from "@/components/page/entity-detail-page";
import { MetaFacts } from "@/components/page/page-header";
import { HeadlineFigure, SummaryPanel } from "@/components/page/summary-panel";
import { EditedBadge } from "@/components/ledger/corrected-badge";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { LedgerHistoryToggle } from "@/components/ledger/ledger-history-toggle";
import { FxConversionForm } from "@/components/forms/fx-conversion-form";
import {
  CorrectFxPurchaseForm,
  type CorrectableFxPurchaseRow,
} from "@/components/forms/correct-fx-purchase-form";
import {
  CorrectFxLedgerForm,
  type CorrectableFxSpendRow,
} from "@/components/forms/correct-fx-ledger-form";
import { FxExpenseSpendForm } from "@/components/forms/fx-expense-spend-form";
import { FxPurchaseForm } from "@/components/forms/fx-purchase-form";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { apiFetch } from "@/lib/api";
import type {
  FxBalanceRead,
  FxLedgerEntryRead,
  MoneyAccountRead,
} from "@/lib/banking-types";
import { formatFxNative } from "@/lib/fx-money";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { subledgerRowClassName } from "@/lib/ledger-display";
import { fxLedgerVoidConfirmDetail } from "@/lib/ledger-void-confirm-detail";
import { useLedgerHistoryView } from "@/lib/use-ledger-history-view";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

export function FxWalletPageContent() {
  const params = useParams<{ id: string }>();
  const accountId = params.id;
  const { entityId } = useEntity();
  const { from, to, setRange } = useReportRangeFromUrl();
  const [account, setAccount] = useState<MoneyAccountRead | null>(null);
  const [balance, setBalance] = useState<FxBalanceRead | null>(null);
  const [ledger, setLedger] = useState<FxLedgerEntryRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [spendOpen, setSpendOpen] = useState(false);
  const [correctPurchase, setCorrectPurchase] =
    useState<CorrectableFxPurchaseRow | null>(null);
  const [correctSpend, setCorrectSpend] = useState<CorrectableFxSpendRow | null>(null);
  const [voidTarget, setVoidTarget] = useState<{
    journal_entry_id: string;
    description: string;
    kind: "purchase" | "ledger";
  } | null>(null);

  const ledgerQuery = useMemo(() => {
    const params = new URLSearchParams({ from, to, limit: "50" });
    return params.toString();
  }, [from, to]);

  const reload = useCallback(async () => {
    if (!entityId || !accountId) return;
    setLoading(true);
    setError(null);
    try {
      const [acct, bal, ledRes] = await Promise.all([
        apiFetch<MoneyAccountRead>(
          `/entities/${entityId}/banking/accounts/${accountId}`,
        ),
        apiFetch<FxBalanceRead>(
          `/entities/${entityId}/fx/accounts/${accountId}/balance`,
        ),
        apiFetch<{ items: FxLedgerEntryRead[] }>(
          `/entities/${entityId}/fx/accounts/${accountId}/ledger?${ledgerQuery}`,
        ),
      ]);
      setAccount(acct);
      setBalance(bal);
      setLedger(ledRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, accountId, ledgerQuery]);

  useEffect(() => {
    setCorrectPurchase(null);
    setCorrectSpend(null);
    void reload();
  }, [reload]);

  const {
    showHistory,
    setShowHistory,
    hiddenCount,
    visibleRows,
  } = useLedgerHistoryView(ledger);

  const currency = balance?.currency ?? account?.currency ?? "USD";

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  return (
    <EntityDetailPage
      title={account?.name ?? `${currency} wallet`}
      loading={loading}
      error={error}
      meta={account && <MetaFacts items={[`${currency} wallet`]} />}
      primaryAction={
        <Button onClick={() => setPurchaseOpen(true)}>Buy {currency}</Button>
      }
      actions={
        <>
          <Button variant="secondary" onClick={() => setConvertOpen(true)}>
            Convert to TRY
          </Button>
          <Button variant="secondary" onClick={() => setSpendOpen(true)}>
            Spend on expense
          </Button>
        </>
      }
      headline={
        balance && (
          <HeadlineFigure
            label="Wallet balance"
            icon={Coins}
            amountKurus={balance.native_quantity}
            format={() => formatFxNative(balance.native_quantity, currency)}
          />
        )
      }
      panels={
        balance && (
          <SummaryPanel
            title="What it cost in lira"
            lines={[
              { label: "TRY cost basis", amountKurus: balance.try_cost_kurus },
              { label: "General ledger", amountKurus: balance.gl_balance_kurus },
            ]}
          />
        )
      }
      activity={
        balance &&
        account && (
          <DetailSection
            title="Ledger"
            controls={
              <div className="flex flex-wrap items-center gap-3">
                <ReportDateRange
                  from={from}
                  to={to}
                  disabled={loading}
                  onChange={setRange}
                />
                <LedgerHistoryToggle
                  hiddenCount={hiddenCount}
                  showHistory={showHistory}
                  onToggle={setShowHistory}
                />
              </div>
            }
          >
            {ledger.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No FX movements in this date range.
              </p>
            ) : visibleRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No current entries — show correction history to see voided rows.
              </p>
            ) : (
              <DataTable wide>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Date</DataTableHeaderCell>
                    <DataTableHeaderCell>Type</DataTableHeaderCell>
                    <DataTableHeaderCell>Description</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">
                      {currency}
                    </DataTableHeaderCell>
                    <DataTableHeaderCell align="right">TRY cost</DataTableHeaderCell>
                    <DataTableHeaderCell>Actions</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <DataTableBody>
                  {visibleRows.map((row) => (
                    <DataTableRow
                      key={row.id}
                      className={subledgerRowClassName(row.display_kind)}
                    >
                      <DataTableCell>
                        {formatTrDate(row.movement_date)}
                      </DataTableCell>
                      <DataTableCell>{row.movement_type}</DataTableCell>
                      <DataTableCell>
                        {row.description}
                        {row.was_corrected && (
                          <span className="ml-2">
                            <EditedBadge />
                          </span>
                        )}
                      </DataTableCell>
                      <DataTableCell align="right">
                        {formatFxNative(
                          Math.abs(row.native_quantity),
                          currency,
                        )}
                      </DataTableCell>
                      <DataTableCell align="right">
                        {formatTry(row.try_cost_kurus)}
                      </DataTableCell>
                      <DataTableCell align="right">
                        {row.movement_type === "spend" &&
                          row.journal_source &&
                          row.journal_source !== "fx_purchase" && (
                            <SubledgerRowActions
                              row={row}
                              voidConfirmDetail={fxLedgerVoidConfirmDetail({
                                movement_date: row.movement_date,
                                movement_type: row.movement_type,
                                native_quantity: row.native_quantity,
                                currency,
                                description: row.description,
                              })}
                              onEdit={() =>
                                setCorrectSpend({
                                  journal_entry_id: row.journal_entry_id,
                                  movement_date: row.movement_date,
                                  movement_type: row.movement_type,
                                  native_quantity: row.native_quantity,
                                  try_cost_kurus: row.try_cost_kurus,
                                  description: row.description,
                                  journal_source: row.journal_source,
                                  fx_money_account_id: row.fx_money_account_id,
                                })
                              }
                              onVoid={() =>
                                setVoidTarget({
                                  journal_entry_id: row.journal_entry_id,
                                  description: row.description,
                                  kind: "ledger",
                                })
                              }
                            />
                          )}
                        {row.movement_type === "purchase" && (
                          <SubledgerRowActions
                            row={row}
                            voidConfirmDetail={fxLedgerVoidConfirmDetail({
                              movement_date: row.movement_date,
                              movement_type: row.movement_type,
                              native_quantity: row.native_quantity,
                              currency,
                              description: row.description,
                            })}
                            onEdit={() =>
                              setCorrectPurchase({
                                journal_entry_id: row.journal_entry_id,
                                movement_date: row.movement_date,
                                native_quantity: row.native_quantity,
                                try_cost_kurus: row.try_cost_kurus,
                                description: row.description,
                                try_cash_money_account_id:
                                  row.try_cash_money_account_id,
                              })
                            }
                            onVoid={() =>
                              setVoidTarget({
                                journal_entry_id: row.journal_entry_id,
                                description: row.description,
                                kind: "purchase",
                              })
                            }
                          />
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            )}
          </DetailSection>
        )
      }
    >
      <FxPurchaseForm
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        fxAccountId={accountId}
        currency={currency}
        onSaved={() => void reload()}
      />
      <FxConversionForm
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        fxAccountId={accountId}
        currency={currency}
        onSaved={() => void reload()}
      />
      <FxExpenseSpendForm
        open={spendOpen}
        onClose={() => setSpendOpen(false)}
        fxAccountId={accountId}
        currency={currency}
        onSaved={() => void reload()}
      />
      <CorrectFxPurchaseForm
        open={correctPurchase !== null}
        fxAccountId={accountId}
        currency={currency}
        purchase={correctPurchase}
        onClose={() => setCorrectPurchase(null)}
        onSaved={() => void reload()}
      />
      <CorrectFxLedgerForm
        open={correctSpend !== null}
        currency={currency}
        entry={correctSpend}
        onClose={() => setCorrectSpend(null)}
        onSaved={() => void reload()}
      />
      <VoidSubledgerDialog
        open={voidTarget !== null}
        title={
          voidTarget?.kind === "purchase"
            ? `Void ${currency} purchase`
            : "Void FX movement"
        }
        description={voidTarget?.description}
        voidPath={
          entityId && voidTarget
            ? voidTarget.kind === "purchase"
              ? `/entities/${entityId}/fx/purchases/${voidTarget.journal_entry_id}/void`
              : `/entities/${entityId}/fx/ledger/${voidTarget.journal_entry_id}/void`
            : null
        }
        onClose={() => setVoidTarget(null)}
        onSaved={() => void reload()}
      />
    </EntityDetailPage>
  );
}
