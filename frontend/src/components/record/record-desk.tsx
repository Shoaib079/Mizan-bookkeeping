"use client";

/** Record desk v3 — icon grid, inline form, recent transactions. */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { DetectedDocumentType } from "@/components/forms/add-document-dialog";
import { RecordDeskFormPanel } from "@/components/record/record-desk-form-panel";
import { RecordDeskIconGrid } from "@/components/record/record-desk-icon-grid";
import {
  RECORD_DESK_TILES,
  type RecordDeskTileId,
} from "@/components/record/record-desk-tiles";
import { RecentlyRecordedCard } from "@/components/record/recently-recorded-card";
import { useQuickActions } from "@/components/quick-actions";
import { canUseRecordAction, shouldShowNewMenu } from "@/lib/entity-access";
import { hasCashCountDraft } from "@/lib/cash-count-draft";
import { emitLedgerChanged } from "@/lib/ledger-events";
import type { RecordActionKey } from "@/lib/record-actions";
import { useEntity } from "@/lib/entity-context";
import { useEntityAccess } from "@/lib/use-entity-access";
import { cn } from "@/lib/utils";

const DOCUMENT_ROUTE: Record<DetectedDocumentType, RecordActionKey> = {
  invoice: "efatura",
  bank_statement: "bankStatement",
  expense_receipt: "receipt",
  pos_daily_summary: "posPhoto",
};

export type RecordDeskMode = RecordDeskTileId;

export function RecordDesk({ mobileQuick = false }: { mobileQuick?: boolean }) {
  const { entityId } = useEntity();
  const { grants } = useEntityAccess();
  const {
    deliveryEnabled,
    openRecordAction,
    openRecordActionWithFile,
  } = useQuickActions();

  const tiles = useMemo(
    () =>
      RECORD_DESK_TILES.filter((tile) =>
        canUseRecordAction(grants, tile.actionKey),
      ),
    [grants],
  );

  const [mode, setMode] = useState<RecordDeskTileId>("sales");
  const [cashCountDraftPending, setCashCountDraftPending] = useState(false);

  useEffect(() => {
    if (tiles.length === 0) return;
    if (!tiles.some((t) => t.id === mode)) {
      setMode(tiles[0]!.id);
    }
  }, [tiles, mode]);

  useEffect(() => {
    setCashCountDraftPending(hasCashCountDraft(entityId));
  }, [entityId, mode]);

  const onRecorded = useCallback(() => {
    emitLedgerChanged();
    setCashCountDraftPending(hasCashCountDraft(entityId));
  }, [entityId]);

  const handleDocumentConfirm = useCallback(
    (type: DetectedDocumentType, file: File) => {
      openRecordActionWithFile(DOCUMENT_ROUTE[type], file);
    },
    [openRecordActionWithFile],
  );

  const activeTile = tiles.find((t) => t.id === mode) ?? tiles[0] ?? null;

  if (!shouldShowNewMenu(grants)) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        View only — you can review figures under Reports and the dashboard, but
        recording is limited to users with operations access.
      </p>
    );
  }

  if (tiles.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        No record actions are available for your access level.
      </p>
    );
  }

  return (
    <div className={cn("space-y-6", mobileQuick && "space-y-4")}>
      <div
        className={cn(
          "flex flex-col gap-4",
          !mobileQuick && "lg:flex-row lg:items-start lg:gap-5",
        )}
      >
        <RecordDeskIconGrid
          tiles={tiles}
          activeId={mode}
          cashCountDraftPending={cashCountDraftPending}
          onSelect={setMode}
        />

        <RecordDeskFormPanel
          tile={activeTile}
          deliveryEnabled={deliveryEnabled}
          onRecorded={onRecorded}
          onDocumentConfirm={handleDocumentConfirm}
          onOpenDeliveryReport={() => openRecordAction("deliveryReport")}
          onContinueToCloseDay={() => setMode("closeDay")}
          onDraftChange={setCashCountDraftPending}
          mobileQuick={mobileQuick}
        />
      </div>

      {entityId && <RecentlyRecordedCard entityId={entityId} />}
    </div>
  );
}
