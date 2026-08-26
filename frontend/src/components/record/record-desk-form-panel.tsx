"use client";

/** Right panel — embedded form for the selected Record desk tile. */

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
import type { RecordActionKey } from "@/lib/record-actions";
import { cn } from "@/lib/utils";

type ExtraMode = "addDocument" | "countCash" | "closeDay";

type Props = {
  tile: RecordDeskTile | null;
  extraMode: ExtraMode | null;
  deliveryEnabled: boolean;
  onRecorded: () => void;
  onDocumentConfirm: (type: DetectedDocumentType, file: File) => void;
  onOpenDeliveryReport: () => void;
  onContinueToCloseDay: () => void;
  onDraftChange: (pending: boolean) => void;
  mobileQuick?: boolean;
};

export function RecordDeskFormPanel({
  tile,
  extraMode,
  deliveryEnabled,
  onRecorded,
  onDocumentConfirm,
  onOpenDeliveryReport,
  onContinueToCloseDay,
  onDraftChange,
  mobileQuick = false,
}: Props) {
  const modeId: RecordDeskTileId | ExtraMode | null = extraMode ?? tile?.id ?? null;
  const title = extraMode
    ? extraMode === "addDocument"
      ? "Upload"
      : extraMode === "countCash"
        ? "Count cash"
        : "Close day"
    : tile?.label ?? "Record";
  const hint = extraMode
    ? extraMode === "addDocument"
      ? "Receipts, statements, invoices, Z reports — auto-routed."
      : extraMode === "countCash"
        ? "Count notes and compare to the books — does not post."
        : "Post over/short, lock the day, optionally send cash elsewhere."
    : tile?.hint ?? "";
  const ActiveIcon = tile?.icon;

  return (
    <section className={cn("min-w-0 flex-1", !mobileQuick && "lg:max-w-2xl")}>
      <div
        className={cn(
          "rounded-lg border border-border bg-card shadow-sm",
          mobileQuick && "border-0 shadow-none",
        )}
        data-testid="record-desk-form-panel"
      >
        <header
          className={cn(
            "border-b border-border px-4 py-3",
            mobileQuick && "hidden",
          )}
        >
          <div className="flex items-center gap-2.5">
            {ActiveIcon && !extraMode && tile && (
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

        <div className={cn("p-4", mobileQuick && "px-0 pt-2")}>
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

          {modeId === "staffSalary" && (
            <ManualExpenseForm
              embedded
              open
              title="Staff salary"
              defaultRecordKind="salary"
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

export type { ExtraMode };
export type ExtraActionKey = Extract<
  RecordActionKey,
  "addDocument" | "countCash" | "closeDay"
>;
