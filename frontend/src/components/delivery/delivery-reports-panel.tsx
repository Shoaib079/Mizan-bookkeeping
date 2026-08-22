"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DeliveryDownloadMenu } from "@/components/delivery/delivery-download-menu";
import { DeliveryPlatformFilter } from "@/components/delivery/delivery-platform-filter";
import { DeliveryReportReview } from "@/components/delivery-report-review";
import { DeliveryReportForm } from "@/components/forms/delivery-report-form";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { VoidTriggerButton } from "@/components/ledger/void-trigger-button";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
} from "@/components/ui/data-table";
import { PageHeader } from "@/components/page/page-header";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { HeadlineFigure } from "@/components/page/summary-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Truck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatDeliveryPeriod } from "@/lib/delivery-period";
import { deliveryReportVoidConfirmDetail } from "@/lib/ledger-void-confirm-detail";
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
  const [voidReport, setVoidReport] = useState<DeliveryReport | null>(null);
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
      <PageHeader
        title="Delivery sales"
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
          /* Gated on having platforms at all, not on the filter above.
           *
           * The filter chooses what the table *shows*; it was also deciding
           * whether you could record anything, so with no platform picked the
           * page's one action sat greyed out with nothing saying why. The form
           * asks which platform — and pre-selects one when the filter has
           * narrowed it — so there was never anything it needed from here.
           *
           * With no platforms the combobox has nothing to offer, so the button
           * stays down and the empty state below says where to add them. */
          <Button
            type="button"
            disabled={!entityId || platforms.length === 0}
            onClick={() => setFormOpen(true)}
          >
            Record sales
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

      {entityId && items.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3">
          <HeadlineFigure
            label={`Posted sales total${selectedPlatform ? ` — ${selectedPlatform.name}` : ""}`}
            amountKurus={postedTotal}
          />
        </div>
      )}

      <div className="mb-4 mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          {!entityId
            ? "Select a restaurant in the sidebar"
            : `${total} entr${total === 1 ? "y" : "ies"} in range`}
        </p>

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
              <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
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
                  <DataTableCell
                    align="right"
                    className="py-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {row.status === "posted" && (
                      <VoidTriggerButton
                        confirmDetail={deliveryReportVoidConfirmDetail({
                          period_label: formatDeliveryPeriod(row),
                          platform_name: row.platform_name,
                          gross_kurus: row.gross_kurus,
                        })}
                        onContinue={() => setVoidReport(row)}
                      />
                    )}
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

      <VoidSubledgerDialog
        open={voidReport !== null}
        title="Void delivery report"
        description={
          voidReport
            ? `${voidReport.platform_name} — ${formatDeliveryPeriod(voidReport)}`
            : undefined
        }
        voidPath={
          entityId && voidReport
            ? `/entities/${entityId}/delivery/reports/${voidReport.id}/void`
            : null
        }
        onClose={() => setVoidReport(null)}
        onSaved={() => {
          setVoidReport(null);
          void reload();
        }}
      />
    </>
  );
}
