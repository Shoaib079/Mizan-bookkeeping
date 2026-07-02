"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DeliveryHubToolbar } from "@/components/delivery/delivery-hub-toolbar";
import { DeliveryPlatformFilter } from "@/components/delivery/delivery-platform-filter";
import { DeliveryReportReview } from "@/components/delivery-report-review";
import { DeliveryReportForm } from "@/components/forms/delivery-report-form";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Truck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatDeliveryPeriod } from "@/lib/delivery-period";
import { useDeliveryHubUrl } from "@/lib/use-delivery-hub-url";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import type { DeliveryPlatform, DeliveryReport } from "@/lib/pos-delivery-types";
import { useEntityList } from "@/lib/use-entity-list";
import { cn } from "@/lib/utils";

export function DeliveryReportsPanel() {
  const { entityId } = useEntity();
  const {
    from,
    to,
    platform,
    setRange,
    setPlatform,
    setDetailId,
    listQuery,
    exportQuery,
    reportId,
  } = useDeliveryHubUrl("/delivery/reports");

  const [platforms, setPlatforms] = useState<DeliveryPlatform[]>([]);
  const [platformsLoading, setPlatformsLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const listPath = `/delivery/reports?${listQuery}`;
  const { items, total, loading, error, reload } = useEntityList<DeliveryReport>(
    listPath,
    entityId,
  );

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
    if (!entityId || !reportId || platform) return;
    void apiFetch<DeliveryReport>(
      `/entities/${entityId}/delivery/reports/${reportId}`,
    )
      .then((report) => setPlatform(report.delivery_platform_id))
      .catch(() => undefined);
  }, [entityId, platform, reportId, setPlatform]);

  useEffect(() => {
    if (!reportId) return;
    if (items.some((row) => row.id === reportId)) return;
    if (loading) return;
    setDetailId("report", null);
  }, [items, loading, reportId, setDetailId]);

  const postedTotal = useMemo(
    () =>
      items
        .filter((row) => row.status === "posted")
        .reduce((sum, row) => sum + row.gross_kurus, 0),
    [items],
  );

  const selectedPlatform = platforms.find((p) => p.id === platform);

  function onReportSaved(id?: string) {
    void reload();
    if (id) setDetailId("report", id);
  }

  return (
    <>
      <DeliveryHubToolbar
        entityId={entityId ?? ""}
        from={from}
        to={to}
        exportQuery={exportQuery}
        platformId={platform}
        platformName={selectedPlatform?.name}
        onRangeChange={setRange}
        disabled={loading}
      />

      <div className="mb-4 mt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {!entityId
              ? "Select a restaurant in the sidebar"
              : `${total} entr${total === 1 ? "y" : "ies"} in range`}
          </p>
          <Button
            type="button"
            disabled={!entityId || !platform}
            onClick={() => setFormOpen(true)}
          >
            Record sales
          </Button>
        </div>

        {platformsLoading && (
          <p className="text-sm text-muted-foreground">Loading platforms…</p>
        )}

        {!platformsLoading && entityId && platforms.length === 0 && (
          <EmptyState
            icon={Truck}
            title="No delivery platforms yet"
            hint="Add platforms under Delivery → Delivery platforms first."
          />
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
            Posted sales total{selectedPlatform ? ` — ${selectedPlatform.name}` : ""}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatTry(postedTotal)}
          </p>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={platform ? 3 : 4} />}

      {!loading && entityId && items.length === 0 && (
        <EmptyState
          icon={Truck}
          title="No sales in this period"
          hint="Change the date range or record sales for a platform."
        />
      )}

      {!loading && items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              {!platform && (
                <DataTableHeaderCell>Platform</DataTableHeaderCell>
              )}
              <DataTableHeaderCell>Period</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Gross</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => {
              const selected = row.id === reportId;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "cursor-pointer border-b border-border transition-colors hover:bg-muted/40",
                    selected && "bg-primary/5",
                  )}
                  onClick={() => setDetailId("report", row.id)}
                >
                  {!platform && (
                    <DataTableCell className="py-2 text-sm">
                      {row.platform_name}
                    </DataTableCell>
                  )}
                  <DataTableCell className="py-2 text-sm">
                    {formatDeliveryPeriod(row)}
                  </DataTableCell>
                  <DataTableCell align="right" className="py-2 tabular-nums">
                    {formatTry(row.gross_kurus)}
                  </DataTableCell>
                  <DataTableCell className="py-2">
                    <StatusBadge status={row.status} />
                  </DataTableCell>
                </tr>
              );
            })}
          </DataTableBody>
        </DataTable>
      )}

      {reportId && (
        <section className="mt-6 rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-semibold">Sales detail</h2>
          <DeliveryReportReview
            key={reportId}
            reportId={reportId}
            onUpdated={() => void reload()}
          />
        </section>
      )}

      <DeliveryReportForm
        open={formOpen}
        defaultPlatformId={platform ?? undefined}
        defaultPeriodFrom={from}
        defaultPeriodTo={to}
        onClose={() => setFormOpen(false)}
        onSaved={onReportSaved}
      />
    </>
  );
}
