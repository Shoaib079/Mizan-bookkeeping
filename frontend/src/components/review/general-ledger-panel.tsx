"use client";

/** General ledger — all journal entries (Reports → Financial statements). */

import { Suspense } from "react";

import { CorrectLedgerEntryForm } from "@/components/forms/correct-ledger-entry-form";
import { ForbiddenMessage } from "@/components/reports/forbidden-message";
import { GeneralLedgerFilters } from "@/components/review/general-ledger-filters";
import { GeneralLedgerTable } from "@/components/review/general-ledger-table";
import { useGeneralLedgerPanel } from "@/components/review/use-general-ledger-panel";
import { AfterFirstLoad, PageSkeleton } from "@/components/ui/skeleton";

function LedgerPanelContent() {
  const s = useGeneralLedgerPanel();

  if (!s.entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  return (
    <>
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Every journal entry for this restaurant — posted and voided. Edit or
        void manual journals and bank charges directly here; expand any other
        entry for a direct link to the flow that manages it.
      </p>

      <GeneralLedgerFilters
        entityId={s.entityId}
        from={s.from}
        to={s.to}
        q={s.q}
        source={s.source}
        status={s.status}
        showHistory={s.showHistory}
        searchDraft={s.searchDraft}
        loading={s.loading}
        onRangeChange={s.setRange}
        onSearchDraftChange={s.setSearchDraft}
        onApplySearch={s.applySearch}
        onSetParams={s.setParams}
      />

      {s.forbidden && <ForbiddenMessage />}
      {s.error && <p className="mb-4 text-sm text-destructive">{s.error}</p>}
      <PageSkeleton when={s.loading} />

      <AfterFirstLoad when={s.loading}>
        {!s.forbidden && (
          <GeneralLedgerTable
            items={s.items}
            total={s.total}
            offset={s.offset}
            pageStart={s.pageStart}
            pageEnd={s.pageEnd}
            canPrev={s.canPrev}
            canNext={s.canNext}
            focusId={s.focusId}
            expandedId={s.expandedId}
            onExpandedIdChange={s.setExpandedId}
            onSetParams={s.setParams}
            onCorrectTarget={s.setCorrectTarget}
            onSaved={() => void s.reload()}
            accountLabel={s.accountLabel}
            onNavigateEntry={s.navigateToEntry}
          />
        )}
      </AfterFirstLoad>

      <CorrectLedgerEntryForm
        open={s.correctTarget !== null}
        entry={s.correctTarget}
        onClose={() => s.setCorrectTarget(null)}
        onSaved={() => void s.reload()}
      />
    </>
  );
}

export function GeneralLedgerPanel() {
  return (
    <Suspense>
      <LedgerPanelContent />
    </Suspense>
  );
}
