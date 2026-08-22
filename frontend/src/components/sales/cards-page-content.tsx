"use client";

/** Card sales, settlements, clearing reconciliation — Phase 9 Slice 5. */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CardSalesForm } from "@/components/forms/card-sales-form";
import { ClearCommissionForm } from "@/components/forms/clear-commission-form";
import { PosSettlementForm } from "@/components/forms/pos-settlement-form";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { VoidTriggerButton } from "@/components/ledger/void-trigger-button";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { PageHeader } from "@/components/page/page-header";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/skeleton";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { useCardsUrl } from "@/lib/use-cards-url";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  cardSalesBatchVoidConfirmDetail,
  posSettlementVoidConfirmDetail,
} from "@/lib/ledger-void-confirm-detail";
import type {
  CardSalesBatch,
  ClearingReconciliation,
  PosSettlement,
} from "@/lib/pos-delivery-types";

export function CardsPageContent() {
  const { entityId } = useEntity();
  const { from, to, setRange, listQuery } = useCardsUrl();
  const [batches, setBatches] = useState<CardSalesBatch[]>([]);
  const [settlements, setSettlements] = useState<PosSettlement[]>([]);
  const [voidSettlement, setVoidSettlement] = useState<PosSettlement | null>(null);
  const [voidBatch, setVoidBatch] = useState<CardSalesBatch | null>(null);
  const [recon, setRecon] = useState<ClearingReconciliation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardFormOpen, setCardFormOpen] = useState(false);
  const [settleFormOpen, setSettleFormOpen] = useState(false);
  const [clearFormOpen, setClearFormOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!entityId) {
      setBatches([]);
      setSettlements([]);
      setRecon(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [batchRes, settleRes, reconRes] = await Promise.all([
        apiFetch<{ items: CardSalesBatch[] }>(
          `/entities/${entityId}/pos/card-sales?${listQuery}`,
        ),
        apiFetch<{ items: PosSettlement[] }>(
          `/entities/${entityId}/pos/settlements?${listQuery}`,
        ),
        apiFetch<ClearingReconciliation>(
          `/entities/${entityId}/pos/clearing-reconciliation?${listQuery}`,
        ),
      ]);
      setBatches(batchRes.items);
      setSettlements(settleRes.items);
      setRecon(reconRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, listQuery]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <>
      <PageHeader
        title="Cards"
        meta="Card clearing, bank settlements, and commission clearance. Batches and settlements are filtered by date; clearing balance is current."
        primaryAction={
          <Button
            type="button"
            disabled={!entityId}
            onClick={() => setSettleFormOpen(true)}
          >
            Record settlement
          </Button>
        }
        actions={
          <Button
            type="button"
            variant="secondary"
            disabled={!entityId}
            onClick={() => setCardFormOpen(true)}
          >
            New card batch
          </Button>
        }
        overflowActions={[
          {
            label: "Record commission",
            onSelect: () => setClearFormOpen(true),
          },
        ]}
      />

      <div className="mb-4">
        <ReportDateRange
          from={from}
          to={to}
          disabled={loading}
          onChange={setRange}
        />
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <PageSkeleton when={loading} />

      {/* Card clearing is an asset — it cannot legitimately go negative. When
       * it does, deposits have been recorded but the card sales behind them
       * have not, and card revenue is understated by that amount. Purely
       * informational: it never disables an action or blocks a recording,
       * because the way to fix it is to carry on entering the missing sales. */}
      {recon && recon.clearing_balance_kurus < 0 && (
        <section className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <h2 className="text-sm font-semibold">
            Card sales missing for {formatTry(Math.abs(recon.clearing_balance_kurus))}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bank deposits from the card processor are recorded, but the daily
            sales behind them are not — so card revenue is understated by about
            this much. Enter the missing daily sales and this clears itself.
          </p>
          <Link
            href="/sales"
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            Open Daily sales
          </Link>
        </section>
      )}

      {recon && (
        <section className="mb-6 rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Clearing reconciliation</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex justify-between gap-4 sm:block">
              <dt className="text-muted-foreground">Clearing balance</dt>
              <dd className="tabular-nums font-medium">
                {formatTry(recon.clearing_balance_kurus)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 sm:block">
              <dt className="text-muted-foreground">Total card sales</dt>
              <dd className="tabular-nums">
                {formatTry(recon.total_card_sales_kurus)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 sm:block">
              <dt className="text-muted-foreground">Settled gross</dt>
              <dd className="tabular-nums">
                {formatTry(recon.total_settled_gross_kurus)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 sm:block">
              <dt className="text-muted-foreground">In transit</dt>
              <dd className="tabular-nums">{formatTry(recon.in_transit_kurus)}</dd>
            </div>
            <div className="flex justify-between gap-4 sm:block">
              <dt className="text-muted-foreground">Batches</dt>
              <dd>{recon.card_sales_batch_count}</dd>
            </div>
            <div className="flex justify-between gap-4 sm:block">
              <dt className="text-muted-foreground">Settlements</dt>
              <dd>{recon.pos_settlement_count}</dd>
            </div>
          </dl>

          <div className="mt-4 border-t border-border pt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              This period{" "}
              {recon.period_from && recon.period_to
                ? `(${formatTrDate(recon.period_from)} – ${formatTrDate(recon.period_to)})`
                : ""}
            </h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Opening in-transit</dt>
                <dd className="tabular-nums">
                  {formatTry(recon.opening_in_transit_kurus)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">+ Card sales</dt>
                <dd className="tabular-nums">
                  {formatTry(recon.period_card_sales_kurus)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">− Deposits &amp; clearances</dt>
                <dd className="tabular-nums">
                  {formatTry(recon.period_clearances_kurus)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-border pt-1 font-medium">
                <dt>= Closing in-transit</dt>
                <dd className="tabular-nums">
                  {formatTry(recon.closing_in_transit_kurus)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 pt-1">
                <dt className="text-muted-foreground">
                  Commission recorded (5310)
                </dt>
                <dd className="tabular-nums">
                  {formatTry(recon.commission_recorded_kurus)}
                </dd>
              </div>
            </dl>
          </div>

          {recon.aging.some((b) => b.amount_kurus !== 0) && (
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Undeposited card sales — aging
              </h3>
              <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                {recon.aging.map((b) => (
                  <div key={b.label} className="flex justify-between gap-4 sm:block">
                    <dt className="text-muted-foreground">{b.label}</dt>
                    <dd className="tabular-nums">{formatTry(b.amount_kurus)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">
                Money waiting for the bank to deposit. Anything in the older
                buckets is card revenue the bank hasn&apos;t settled yet — or
                sales recorded without a matching deposit.
              </p>
            </div>
          )}
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Card sales batches</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No card batches in this period.
          </p>
        ) : (
          <DataTable wide>
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Date</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Gross</DataTableHeaderCell>
                <DataTableHeaderCell>Description</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {batches.map((row) => (
                <DataTableRow
                  key={row.id}
                  className={row.status === "voided" ? "text-muted-foreground line-through opacity-70" : undefined}
                >
                  <DataTableCell>{formatTrDate(row.sales_date)}</DataTableCell>
                  <DataTableCell align="right">
                    {formatTry(row.gross_amount_kurus)}
                  </DataTableCell>
                  <DataTableCell>{row.description}</DataTableCell>
                  <DataTableCell align="right">
                    {row.status !== "voided" && (
                      <VoidTriggerButton
                        confirmDetail={cardSalesBatchVoidConfirmDetail(row)}
                        onContinue={() => setVoidBatch(row)}
                      />
                    )}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">POS settlements</h2>
        {settlements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No settlements in this period.
          </p>
        ) : (
          <DataTable wide>
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Date</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Bank commission</DataTableHeaderCell>
                <DataTableHeaderCell>Description</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {settlements.map((row) => (
                <DataTableRow
                  key={row.id}
                  className={row.status === "voided" ? "text-muted-foreground line-through opacity-70" : undefined}
                >
                  <DataTableCell>
                    {formatTrDate(row.settlement_date)}
                  </DataTableCell>
                  <DataTableCell align="right">
                    {formatTry(row.amount_kurus)}
                  </DataTableCell>
                  <DataTableCell align="right">
                    {row.commission_kurus !== null
                      ? formatTry(row.commission_kurus)
                      : "—"}
                  </DataTableCell>
                  <DataTableCell>{row.description}</DataTableCell>
                  <DataTableCell align="right">
                    {row.status !== "voided" && (
                      <VoidTriggerButton
                        confirmDetail={posSettlementVoidConfirmDetail(row)}
                        onContinue={() => setVoidSettlement(row)}
                      />
                    )}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </section>

      <CardSalesForm
        open={cardFormOpen}
        onClose={() => setCardFormOpen(false)}
        onSaved={() => void reload()}
      />
      <PosSettlementForm
        open={settleFormOpen}
        onClose={() => setSettleFormOpen(false)}
        onSaved={() => void reload()}
      />
      <ClearCommissionForm
        open={clearFormOpen}
        onClose={() => setClearFormOpen(false)}
        onCleared={() => void reload()}
      />
      <VoidSubledgerDialog
        open={voidSettlement !== null}
        title="Void POS settlement"
        description={voidSettlement?.description}
        voidPath={
          entityId && voidSettlement
            ? `/entities/${entityId}/pos/settlements/${voidSettlement.id}/void`
            : null
        }
        onClose={() => setVoidSettlement(null)}
        onSaved={() => {
          setVoidSettlement(null);
          void reload();
        }}
      />
      <VoidSubledgerDialog
        open={voidBatch !== null}
        title="Void card sales batch"
        description={voidBatch?.description}
        voidPath={
          entityId && voidBatch
            ? `/entities/${entityId}/pos/card-sales/${voidBatch.id}/void`
            : null
        }
        onClose={() => setVoidBatch(null)}
        onSaved={() => {
          setVoidBatch(null);
          void reload();
        }}
      />
    </>
  );
}
