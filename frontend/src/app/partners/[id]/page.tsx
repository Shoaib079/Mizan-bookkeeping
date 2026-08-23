"use client";

/** Partner detail — DESIGN_ARCHETYPES §2 (`EntityDetailPage`). */

import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  EntityDetailPage,
} from "@/components/page/entity-detail-page";
import { EditTitleButton, MetaFacts } from "@/components/page/page-header";
import { EntityBalanceSticker } from "@/components/entity-balance-sticker";
import { PartnerRecordForm } from "@/components/forms/partner-record-form";
import { SubledgerDownloadMenu } from "@/components/ledger/subledger-download-menu";
import { PartnerDetailLedger } from "@/components/partners/partner-detail-ledger";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import {
  GlEditDialogs,
  type GlEditTarget,
} from "@/components/ledger/gl-edit-dialogs";
import { PartnerForm, type PartnerRow } from "@/components/forms/partner-form";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useWriteChrome } from "@/lib/use-write-chrome";
import { useEntity } from "@/lib/entity-context";
import {
  partnerBalance,
  partnerBalanceHeading,
  partnerHeadlineCaption,
} from "@/lib/partner-balance";
import {
  groupPartnerLedgerRows,
  partnerLedgerFilterMatches,
  type PartnerLedgerFilter,
  type PartnerLedgerResponse,
} from "@/lib/partner-ledger-view";
import { useEntryActions } from "@/lib/use-entry-actions";
import { useLedgerHistoryView } from "@/lib/use-ledger-history-view";

/** The correction forms this page has. Anything else the backend offers is
 * opened from the General ledger, which has the rest.
 *
 * An allocation is only ever offered here when it covers a single partner —
 * `owner_count` decides that, upstream of this list. Editing one that covers
 * several from one partner's row would change everybody's share. */
const PAGE_EDIT_KINDS = [
  "partner_ledger",
  "partner_profit_allocation",
  "partner_funded_salary",
] as const;

export default function PartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const partnerId = params.id;
  const { entityId } = useEntity();
  const { showWrite } = useWriteChrome();

  const [editOpen, setEditOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [payProfitOpen, setPayProfitOpen] = useState(false);
  // One target for every kind, translated by `editTargetFor` — the same
  // translation the General ledger uses, rather than a second copy here that
  // opened its own form regardless of what the backend named.
  const [editTarget, setEditTarget] = useState<GlEditTarget | null>(null);
  // The path comes from the backend rather than being rebuilt here. A profit
  // allocation voids at `partners/profit-allocation/{entry}/void`, not at the
  // partner-ledger route this page used to assume for every row.
  const [voidTarget, setVoidTarget] = useState<{
    path: string;
    description: string;
  } | null>(null);

  const detailEnabled = Boolean(entityId && partnerId);

  const partnerQuery = useQuery({
    queryKey: ["partners", entityId, partnerId],
    enabled: detailEnabled,
    queryFn: () =>
      apiFetch<PartnerRow>(`/entities/${entityId}/partners/${partnerId}`),
  });
  const ledgerQuery = useQuery({
    queryKey: ["partners", entityId, partnerId, "ledger"],
    enabled: detailEnabled,
    queryFn: () =>
      apiFetch<PartnerLedgerResponse>(
        `/entities/${entityId}/partners/${partnerId}/ledger`,
      ),
  });

  const partner = partnerQuery.data ?? null;
  const ledger = ledgerQuery.data ?? null;
  const loading = partnerQuery.isPending || ledgerQuery.isPending;
  const error =
    partnerQuery.error instanceof Error
      ? partnerQuery.error.message
      : ledgerQuery.error instanceof Error
        ? ledgerQuery.error.message
        : null;

  const reload = useCallback(async () => {
    await Promise.all([partnerQuery.refetch(), ledgerQuery.refetch()]);
  }, [partnerQuery, ledgerQuery]);

  const { showHistory, setShowHistory, hiddenCount, visibleRows } =
    useLedgerHistoryView(ledger?.entries ?? []);

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
  // Asked of the backend, never decided here. The ledger sends the verdicts
  // with its rows, so nothing is fetched and no button arrives late; the ids
  // are still passed for the fallback path against an older backend.
  const { rowActions, failed: actionsFailed, retry: retryActions } = useEntryActions(
    entityId,
    useMemo(
      () =>
        filteredRows
          .map((entry) => entry.journal_entry_id)
          .filter((id): id is string => Boolean(id)),
      [filteredRows],
    ),
    ledger?.entry_actions,
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
          showWrite ? (
            <Button type="button" onClick={() => setRecordOpen(true)}>
              Record
            </Button>
          ) : undefined
        }
        actions={
          <>
            {showWrite && (
              <Button
                type="button"
                variant="positive"
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
            )}
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
        titleAction={
          showWrite ? (
            <EditTitleButton onClick={() => setEditOpen(true)} />
          ) : undefined
        }
        balance={
          ledger && (
            <EntityBalanceSticker
              label={partnerBalanceHeading(partnerBalance(ledger))}
              signedBalanceMinor={partnerBalance(ledger)}
              details={
                <p>{partnerHeadlineCaption(ledger)}</p>
              }
            />
          )
        }
        activity={
          ledger && entityId && (
            <PartnerDetailLedger
              bands={bands}
              hiddenCount={hiddenCount}
              showHistory={showHistory}
              onToggleHistory={setShowHistory}
              ledgerFilter={ledgerFilter}
              onLedgerFilterChange={setLedgerFilter}
              actionsFailed={actionsFailed}
              onRetryActions={retryActions}
              isEmpty={ledger.entries.length === 0}
              isFiltered={visibleRows.length === 0}
              entityId={entityId}
              opensEditKinds={PAGE_EDIT_KINDS}
              rowActions={rowActions}
              onEditTarget={setEditTarget}
              onVoidTarget={setVoidTarget}
            />
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
              netBalanceKurus={partnerBalance(ledger)}
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
            <GlEditDialogs
              target={editTarget}
              onClose={() => setEditTarget(null)}
              onSaved={() => {
                setEditTarget(null);
                void reload();
              }}
            />
            <VoidSubledgerDialog
              open={voidTarget !== null}
              title="Void partner movement"
              description={voidTarget?.description}
              voidPath={voidTarget?.path ?? null}
              onClose={() => setVoidTarget(null)}
              onSaved={() => void reload()}
            />
          </>
        )}
      </EntityDetailPage>
    </AppShell>
  );
}
