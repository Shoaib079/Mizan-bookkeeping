"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DeliveryDownloadMenu } from "@/components/delivery/delivery-download-menu";
import { DeliveryPlatformFilter } from "@/components/delivery/delivery-platform-filter";
import { DeliverySettlementsList } from "@/components/delivery/delivery-settlements-list";
import { DeliverySettlementForm } from "@/components/forms/delivery-settlement-form";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page/page-header";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Truck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useDeliveryHubUrl } from "@/lib/use-delivery-hub-url";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import type { DeliveryPlatform, DeliverySettlement } from "@/lib/pos-delivery-types";
import { useEntityList } from "@/lib/use-entity-list";
import { useIsMobileShell } from "@/lib/use-mobile-shell";

export function DeliverySettlementsPanel() {
  const { entityId } = useEntity();
  const isMobile = useIsMobileShell();
  const {
    from,
    to,
    platform,
    setRange,
    setPlatform,
    setDetailId,
    listQuery,
    exportQuery,
    settlementId,
  } = useDeliveryHubUrl("/delivery/settlements");

  const [platforms, setPlatforms] = useState<DeliveryPlatform[]>([]);
  const [voidSettlement, setVoidSettlement] = useState<DeliverySettlement | null>(
    null,
  );
  const [platformsLoading, setPlatformsLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const listPath = `/delivery/settlements?${listQuery}`;
  const { items, total, loading, error, reload } =
    useEntityList<DeliverySettlement>(listPath, entityId);

  const loadPlatforms = useCallback(async () => {
    if (!entityId) {
      setPlatforms([]);
      return;
    }
    setPlatformsLoading(true);
    try {
      const res = await apiFetch<{ items: DeliveryPlatform[] }>(
        `/entities/${entityId}/delivery/platforms?include_inactive=false&limit=50`,
      );
      setPlatforms(res.items.filter((p) => p.is_active));
    } catch {
      setPlatforms([]);
    } finally {
      setPlatformsLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    void loadPlatforms();
  }, [loadPlatforms]);

  useEffect(() => {
    if (!settlementId) return;
    if (items.some((row) => row.id === settlementId)) return;
    if (loading) return;
    setDetailId("settlement", null);
  }, [items, loading, settlementId, setDetailId]);

  const totalPaid = useMemo(
    () => items.reduce((sum, row) => sum + row.amount_kurus, 0),
    [items],
  );

  const selectedPlatform = platforms.find((p) => p.id === platform);
  const selectedSettlement = items.find((row) => row.id === settlementId);

  return (
    <>
      <PageHeader
        title="Delivery settlements"
        actions={
          <DeliveryDownloadMenu
            entityId={entityId ?? ""}
            exportQuery={exportQuery}
            platformId={platform}
            platformName={selectedPlatform?.name}
            disabled={loading}
          />
        }
        primaryAction={
          <Button
            type="button"
            disabled={!entityId}
            onClick={() => setFormOpen(true)}
          >
            Record settlement
          </Button>
        }
      />

      <div className="mb-6">
        <ReportDateRange
          from={from}
          to={to}
          disabled={loading || !entityId}
          onChange={setRange}
        />
      </div>

      <div className="mb-4 mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          {!entityId
            ? "Select a restaurant in the sidebar"
            : `${total} settlement${total === 1 ? "" : "s"} in range`}
        </p>

        {platformsLoading && (
          <p className="text-sm text-muted-foreground">Loading platforms…</p>
        )}

        {platforms.length > 0 && (
          <DeliveryPlatformFilter
            platforms={platforms}
            selectedId={platform}
            onSelect={setPlatform}
          />
        )}
      </div>

      {entityId && items.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Settlements total{selectedPlatform ? ` — ${selectedPlatform.name}` : ""}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatTry(totalPaid)}
          </p>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={platform ? 3 : 4} />}

      {!loading && entityId && items.length === 0 && (
        <EmptyState
          icon={Truck}
          title="No settlements in this period"
          hint="Change the date range or record a bank payout."
        />
      )}

      {!loading && items.length > 0 && (
        <DeliverySettlementsList
          items={items}
          platformFilter={platform}
          settlementId={settlementId}
          isMobile={isMobile}
          onSelect={(id) => setDetailId("settlement", id)}
          onVoid={setVoidSettlement}
        />
      )}

      {selectedSettlement && (
        <section className="mt-6 rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Settlement detail</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Platform</dt>
              <dd>{selectedSettlement.platform_name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Date</dt>
              <dd>{formatTrDate(selectedSettlement.settlement_date)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="tabular-nums">{formatTry(selectedSettlement.amount_kurus)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Description</dt>
              <dd>{selectedSettlement.description}</dd>
            </div>
          </dl>
        </section>
      )}

      <DeliverySettlementForm
        open={formOpen}
        defaultPlatformId={platform ?? undefined}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />

      <VoidSubledgerDialog
        open={voidSettlement !== null}
        title="Void delivery settlement"
        description={
          voidSettlement
            ? `${voidSettlement.platform_name} — ${voidSettlement.description}`
            : undefined
        }
        voidPath={
          entityId && voidSettlement
            ? `/entities/${entityId}/delivery/settlements/${voidSettlement.id}/void`
            : null
        }
        onClose={() => setVoidSettlement(null)}
        onSaved={() => {
          setVoidSettlement(null);
          void reload();
        }}
      />
    </>
  );
}
