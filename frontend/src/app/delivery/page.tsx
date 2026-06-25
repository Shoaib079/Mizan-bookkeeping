"use client";

/** Delivery hub — platforms, reports, settlements — Phase 9 Slice 5. */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { DeliveryReportForm } from "@/components/forms/delivery-report-form";
import { DeliverySettlementForm } from "@/components/forms/delivery-settlement-form";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import type { DeliveryClearingReconciliation } from "@/lib/pos-delivery-types";

export default function DeliveryPage() {
  const { entityId } = useEntity();
  const [recon, setRecon] = useState<DeliveryClearingReconciliation | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportFormOpen, setReportFormOpen] = useState(false);
  const [settleFormOpen, setSettleFormOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!entityId) {
      setRecon(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<DeliveryClearingReconciliation>(
        `/entities/${entityId}/delivery/clearing-reconciliation`,
      );
      setRecon(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
      setRecon(null);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <AppShell title="Delivery">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Link href="/delivery/platforms">
            <Button variant="secondary" type="button">
              Platforms
            </Button>
          </Link>
          <Link href="/delivery/reports">
            <Button variant="secondary" type="button">
              Reports
            </Button>
          </Link>
          <Link href="/delivery/settlements">
            <Button variant="secondary" type="button">
              Settlements
            </Button>
          </Link>
        </div>
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
            type="button"
            disabled={!entityId}
            onClick={() => setReportFormOpen(true)}
          >
            New report
          </Button>
        </div>
      </div>

      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <PageSkeleton />}

      {recon && recon.platforms.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No delivery platforms yet.{" "}
          <Link href="/delivery/platforms" className="text-primary underline">
            Add a platform
          </Link>{" "}
          to track reports and settlements.
        </p>
      )}

      {recon && recon.platforms.length > 0 && (
        <div className="space-y-4">
          {recon.platforms.map((p) => (
            <section
              key={p.delivery_platform_id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">{p.platform_name}</h2>
                  <p className="text-xs text-muted-foreground">
                    Clearing {p.clearing_account_code}
                    {!p.is_active && " · inactive"}
                  </p>
                </div>
                <span className="tabular-nums text-sm font-medium">
                  {formatTry(p.clearing_balance_kurus)}
                </span>
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Reported gross</dt>
                  <dd className="tabular-nums">
                    {formatTry(p.total_reported_gross_kurus)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Settled net</dt>
                  <dd className="tabular-nums">
                    {formatTry(p.total_settled_net_kurus)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Commission posted</dt>
                  <dd className="tabular-nums">
                    {formatTry(p.total_commission_posted_kurus)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">In transit</dt>
                  <dd className="tabular-nums">{formatTry(p.in_transit_kurus)}</dd>
                </div>
              </dl>
            </section>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Commission e-Faturas: upload via{" "}
        <strong>New → Supplier invoice (e-Fatura)</strong>, link the posted
        delivery report on the review screen, then post commission to clearing.
      </p>

      <DeliveryReportForm
        open={reportFormOpen}
        onClose={() => setReportFormOpen(false)}
        onSaved={() => void reload()}
      />
      <DeliverySettlementForm
        open={settleFormOpen}
        onClose={() => setSettleFormOpen(false)}
        onSaved={() => void reload()}
      />
    </AppShell>
  );
}
