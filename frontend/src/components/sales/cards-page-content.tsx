"use client";

/** Card sales, settlements, clearing reconciliation — Phase 9 Slice 5. */

import { useCallback, useEffect, useState } from "react";

import { CardSalesForm } from "@/components/forms/card-sales-form";
import { ClearCommissionForm } from "@/components/forms/clear-commission-form";
import { PosSettlementForm } from "@/components/forms/pos-settlement-form";
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
          `/entities/${entityId}/pos/clearing-reconciliation`,
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
              </tr>
            </DataTableHead>
            <DataTableBody>
              {batches.map((row) => (
                <DataTableRow key={row.id}>
                  <DataTableCell>{formatTrDate(row.sales_date)}</DataTableCell>
                  <DataTableCell align="right">
                    {formatTry(row.gross_amount_kurus)}
                  </DataTableCell>
                  <DataTableCell>{row.description}</DataTableCell>
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
              </tr>
            </DataTableHead>
            <DataTableBody>
              {settlements.map((row) => (
                <DataTableRow key={row.id}>
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
    </>
  );
}
