"use client";

/** Card sales, settlements, clearing reconciliation — Phase 9 Slice 5. */

import { useCallback, useEffect, useState } from "react";

import { CardSalesForm } from "@/components/forms/card-sales-form";
import { ClearCommissionForm } from "@/components/forms/clear-commission-form";
import { PosSettlementForm } from "@/components/forms/pos-settlement-form";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { VoidTriggerButton } from "@/components/ledger/void-trigger-button";
import { ReportDateRange } from "@/components/reports/report-date-range";
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
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { useCardsUrl } from "@/lib/use-cards-url";
import { formatTrDate, formatTry } from "@/lib/money";
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

  const resetPageState = useCallback(() => {
    setBatches([]);
    setSettlements([]);
    setRecon(null);
    setLoading(true);
    setError(null);
  }, []);

  useEntitySwitchReset(entityId, resetPageState);

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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <ReportDateRange
          from={from}
          to={to}
          disabled={loading}
          onChange={setRange}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            type="button"
            disabled={!entityId}
            onClick={() => setSettleFormOpen(true)}
          >
            Record settlement
          </Button>
          <Button
            variant="secondary"
            type="button"
            disabled={!entityId}
            onClick={() => setClearFormOpen(true)}
          >
            Clear bank commission
          </Button>
          <Button
            type="button"
            disabled={!entityId}
            onClick={() => setCardFormOpen(true)}
          >
            New card batch
          </Button>
        </div>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Card clearing, bank settlements, and commission clearance. Batches and
        settlements below are filtered by date; clearing balance is current.
      </p>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <PageSkeleton />}

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
          <DataTable>
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
                      <VoidTriggerButton onContinue={() => setVoidBatch(row)} />
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
          <DataTable>
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
