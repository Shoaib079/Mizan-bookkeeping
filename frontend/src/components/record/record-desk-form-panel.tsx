"use client";

/** Right panel — embedded form for the selected Record desk tile. */

import { ChevronLeft } from "lucide-react";

import {
  AddDocumentDialog,
  type DetectedDocumentType,
} from "@/components/forms/add-document-dialog";
import { CashCountForm } from "@/components/forms/cash-count-form";
import { CashDrawerCloseDayForm } from "@/components/forms/cash-drawer-close-day-form";
import { ManualDailySalesForm } from "@/components/forms/manual-daily-sales-form";
import { ManualExpenseForm } from "@/components/forms/manual-expense-form";
import { TransferForm } from "@/components/forms/transfer-form";
import { FxUnifiedDialog } from "@/components/record/fx-unified-dialog";
import { RecordPaymentPanel } from "@/components/record/record-payment-panel";
import { RecordSplitPanel } from "@/components/record/record-split-panel";
import type {
  RecordDeskTile,
  RecordDeskTileId,
} from "@/components/record/record-desk-tiles";
import { MOBILE_TOUCH_TARGET } from "@/lib/mobile-shell";
import { cn } from "@/lib/utils";

type Props = {
  tile: RecordDeskTile | null;
  deliveryEnabled: boolean;
  onRecorded: () => void;
  onDocumentConfirm: (type: DetectedDocumentType, file: File) => void;
  onOpenDeliveryReport: () => void;
  onContinueToCloseDay: () => void;
  onDraftChange: (pending: boolean) => void;
  mobileQuick?: boolean;
  /** Phone full-form drill-in — back returns to the tile grid. */
  onBack?: () => void;
};

export function RecordDeskFormPanel({
  tile,
  deliveryEnabled,
  onRecorded,
  onDocumentConfirm,
  onOpenDeliveryReport,
  onContinueToCloseDay,
  onDraftChange,
  mobileQuick = false,
  onBack,
}: Props) {
  const modeId: RecordDeskTileId | null = tile?.id ?? null;
  const title = tile?.formTitle ?? "Record";
  const hint = tile?.hint ?? "";
  const ActiveIcon = tile?.icon;
  const showDrillInHeader = Boolean(onBack);

  return (
    <section className="min-w-0 flex-1" data-testid="record-desk-form-panel">
      <div
        className={cn(
          "rounded-lg border border-border bg-card shadow-sm",
          mobileQuick && !showDrillInHeader && "border-0 shadow-none",
          showDrillInHeader && "border-0 shadow-none",
        )}
      >
        {showDrillInHeader ? (
          <header className="mb-3 space-y-1">
            <button
              type="button"
              onClick={onBack}
              className={cn(
                "inline-flex items-center gap-0.5 -ml-1 rounded-md px-1 text-sm font-medium text-primary",
                MOBILE_TOUCH_TARGET,
              )}
              data-testid="record-desk-form-back"
            >
              <ChevronLeft className="size-5 shrink-0" aria-hidden />
              Back
            </button>
            <div className="flex items-center gap-2.5">
              {ActiveIcon && tile && (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <ActiveIcon className="size-4" aria-hidden />
                </span>
              )}
              <div className="min-w-0">
                <h2 className="text-base font-semibold leading-tight">{title}</h2>
                {hint && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
                )}
              </div>
            </div>
          </header>
        ) : (
          <header
            className={cn(
              "border-b border-border px-4 py-3",
              mobileQuick && "hidden",
            )}
          >
            <div className="flex items-center gap-2.5">
              {ActiveIcon && tile && (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <ActiveIcon className="size-4" aria-hidden />
                </span>
              )}
              <div className="min-w-0">
                <h2 className="text-base font-semibold leading-tight">{title}</h2>
                {hint && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
                )}
              </div>
            </div>
          </header>
        )}

        <div
          className={cn(
            "p-4",
            mobileQuick && "px-0 pt-2",
            showDrillInHeader && "px-0 pt-0",
          )}
        >
          {modeId === "expense" && (
            <ManualExpenseForm
              embedded
              open
              title="Daily expenses"
              defaultRecordKind="expense"
              showRecordKindToggle={false}
              onClose={() => undefined}
              onSaved={onRecorded}
            />
          )}

          {modeId === "sales" && (
            <ManualDailySalesForm
              embedded
              open
              onClose={() => undefined}
              onSaved={onRecorded}
            />
          )}

          {modeId === "payment" && <RecordPaymentPanel onSaved={onRecorded} />}

          {modeId === "transfer" && (
            <TransferForm
              embedded
              open
              onClose={() => undefined}
              onTransferred={onRecorded}
            />
          )}

          {modeId === "split" && <RecordSplitPanel />}

          {modeId === "fx" && (
            <FxUnifiedDialog
              embedded
              open
              onClose={() => undefined}
              onSaved={onRecorded}
            />
          )}

          {modeId === "addDocument" && (
            <AddDocumentDialog
              embedded
              open
              deliveryEnabled={deliveryEnabled}
              onClose={() => undefined}
              onConfirm={onDocumentConfirm}
              onOpenDeliveryReport={onOpenDeliveryReport}
            />
          )}

          {modeId === "countCash" && (
            <CashCountForm
              embedded
              open
              onClose={() => undefined}
              onContinueToCloseDay={onContinueToCloseDay}
              onDraftChange={onDraftChange}
            />
          )}

          {modeId === "closeDay" && (
            <CashDrawerCloseDayForm
              embedded
              open
              onClose={() => undefined}
              onClosed={onRecorded}
              onDraftChange={onDraftChange}
            />
          )}
        </div>
      </div>
    </section>
  );
}
