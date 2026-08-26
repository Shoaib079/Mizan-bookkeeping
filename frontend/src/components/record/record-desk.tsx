"use client";

/** Record desk v3 — icon grid, inline form, recently recorded. */

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DetectedDocumentType } from "@/components/forms/add-document-dialog";
import { RecordDeskFormPanel, type ExtraMode } from "@/components/record/record-desk-form-panel";
import { RecordDeskIconGrid } from "@/components/record/record-desk-icon-grid";
import {
  RECORD_DESK_EXTRA_ACTION_IDS,
  RECORD_DESK_TILES,
  type RecordDeskTileId,
} from "@/components/record/record-desk-tiles";
import { RecentlyRecordedCard } from "@/components/record/recently-recorded-card";
import {
  DeskExtraButton,
  MoreActionButton,
  morePillLabel,
} from "@/components/record/record-desk-buttons";
import { useQuickActions } from "@/components/quick-actions";
import { canUseRecordAction, shouldShowNewMenu } from "@/lib/entity-access";
import { hasCashCountDraft } from "@/lib/cash-count-draft";
import { emitLedgerChanged } from "@/lib/ledger-events";
import {
  recordActionById,
  type RecordActionDef,
  type RecordActionKey,
} from "@/lib/record-actions";
import { useEntity } from "@/lib/entity-context";
import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
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
  const [extraMode, setExtraMode] = useState<ExtraMode | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [cashCountDraftPending, setCashCountDraftPending] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  useDismissOnOutsideClick(moreRef, moreOpen, closeMore);

  useEffect(() => {
    if (tiles.length === 0) return;
    if (!tiles.some((t) => t.id === mode)) {
      setMode(tiles[0]!.id);
      setExtraMode(null);
    }
  }, [tiles, mode]);

  useEffect(() => {
    setCashCountDraftPending(hasCashCountDraft(entityId));
  }, [entityId, mode, extraMode]);

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

  const extraActions = useMemo(() => {
    const actions: RecordActionDef[] = [];
    for (const id of RECORD_DESK_EXTRA_ACTION_IDS) {
      if (!canUseRecordAction(grants, id)) continue;
      const action = recordActionById(id);
      if (action) actions.push(action);
    }
    return actions;
  }, [grants]);

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
        <div className="space-y-2 lg:w-56 lg:shrink-0">
          <RecordDeskIconGrid
            tiles={tiles}
            activeId={extraMode ? "" : mode}
            onSelect={(id) => {
              setMode(id);
              setExtraMode(null);
              setMoreOpen(false);
            }}
          />

          {extraActions.length > 0 && (
            <div className="border-t border-border pt-2">
              {extraActions.length === 1 && (
                <DeskExtraButton
                  action={extraActions[0]!}
                  label={morePillLabel(extraActions[0]!)}
                  onOpen={() => {
                    const id = extraActions[0]!.id as ExtraMode;
                    setExtraMode(id);
                    setMoreOpen(false);
                  }}
                />
              )}

              {extraActions.length > 1 && (
                <div ref={moreRef} className="relative">
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors",
                      moreOpen || extraMode
                        ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                    aria-expanded={moreOpen}
                    aria-haspopup="menu"
                    data-cash-count-draft={cashCountDraftPending ? "true" : undefined}
                    onClick={() => setMoreOpen((v) => !v)}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60">
                      <ChevronDown
                        className={cn(
                          "size-4 transition",
                          moreOpen && "rotate-180",
                        )}
                      />
                    </span>
                    <span>More</span>
                  </button>

                  {moreOpen && (
                    <div
                      role="menu"
                      className="absolute left-0 top-full z-30 mt-1.5 min-w-[11rem] overflow-hidden rounded-md border border-border bg-card py-1 shadow-[var(--shadow-pop)]"
                    >
                      {extraActions.map((action) => (
                        <MoreActionButton
                          key={action.id}
                          action={action}
                          onOpen={() => {
                            closeMore();
                            setExtraMode(action.id as ExtraMode);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <RecordDeskFormPanel
          tile={activeTile}
          extraMode={extraMode}
          deliveryEnabled={deliveryEnabled}
          onRecorded={onRecorded}
          onDocumentConfirm={handleDocumentConfirm}
          onOpenDeliveryReport={() => openRecordAction("deliveryReport")}
          onContinueToCloseDay={() => setExtraMode("closeDay")}
          onDraftChange={setCashCountDraftPending}
          mobileQuick={mobileQuick}
        />
      </div>

      {entityId && <RecentlyRecordedCard entityId={entityId} />}
    </div>
  );
}
