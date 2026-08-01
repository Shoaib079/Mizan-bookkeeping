"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  AddDocumentDialog,
  type DetectedDocumentType,
} from "@/components/forms/add-document-dialog";
import { CashDrawerCloseDayForm } from "@/components/forms/cash-drawer-close-day-form";
import { ManualDailySalesForm } from "@/components/forms/manual-daily-sales-form";
import { ManualExpenseForm } from "@/components/forms/manual-expense-form";
import { RecordedTodayCard } from "@/components/record/recorded-today-card";
import { FxUnifiedDialog } from "@/components/record/fx-unified-dialog";
import { useQuickActions } from "@/components/quick-actions";
import { shouldShowNewMenu } from "@/lib/entity-access";
import { emitLedgerChanged } from "@/lib/ledger-events";
import {
  dailyVisibleSections,
  occasionalRecordActions,
  primaryRecordActions,
  RECORD_SECTION_LABELS,
  type PrimaryRecordActionId,
  type RecordActionDef,
  type RecordActionKey,
  type RecordSectionId,
} from "@/lib/record-actions";
import { useEntity } from "@/lib/entity-context";
import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
import { useEntityAccess } from "@/lib/use-entity-access";
import { cn } from "@/lib/utils";

export type RecordDeskMode = PrimaryRecordActionId;

const DESK_HINTS: Record<RecordDeskMode, string> = {
  expense: "Cash or partner-fronted — bank and card on the statement.",
  staffSalary: "Pay from cash or a partner — accruals and advances on Staff.",
  sales: "POS totals when you do not have a Z photo.",
  fx: "Buy, sell, or spend USD, EUR, or GBP.",
  addDocument: "Receipts, statements, invoices, Z reports — auto-routed.",
  closeDay: "Count the drawer and post over/short.",
};

const DESK_SHORT_LABELS: Record<RecordDeskMode, string> = {
  expense: "Expense",
  staffSalary: "Salary",
  sales: "Sales",
  fx: "FX",
  addDocument: "Upload",
  closeDay: "Close day",
};

const DOCUMENT_ROUTE: Record<DetectedDocumentType, RecordActionKey> = {
  invoice: "efatura",
  bank_statement: "bankStatement",
  expense_receipt: "receipt",
  pos_daily_summary: "posPhoto",
};

export function RecordDesk() {
  const { entityId } = useEntity();
  const { role } = useEntityAccess();
  const {
    deliveryEnabled,
    openRecordAction,
    openRecordActionWithFile,
  } = useQuickActions();
  const [mode, setMode] = useState<RecordDeskMode>("sales");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  useDismissOnOutsideClick(moreRef, moreOpen, closeMore);

  const onRecorded = useCallback(() => {
    emitLedgerChanged();
  }, []);

  const handleDocumentConfirm = useCallback(
    (type: DetectedDocumentType, file: File) => {
      openRecordActionWithFile(DOCUMENT_ROUTE[type], file);
    },
    [openRecordActionWithFile],
  );

  const primaryActions = useMemo(
    () => primaryRecordActions({ deliveryEnabled }),
    [deliveryEnabled],
  );

  const moreSections = useMemo(() => {
    const sections: { section: RecordSectionId; actions: RecordActionDef[] }[] =
      [...dailyVisibleSections({ deliveryEnabled })];
    const occasional = occasionalRecordActions({ deliveryEnabled });
    if (occasional.length > 0) {
      sections.push({ section: "occasional", actions: occasional });
    }
    return sections;
  }, [deliveryEnabled]);

  const moreActions = useMemo(
    () => moreSections.flatMap((group) => group.actions),
    [moreSections],
  );

  const activeAction = primaryActions.find((action) => action.id === mode);
  const activeHint = DESK_HINTS[mode];
  const activeLabel = activeAction
    ? DESK_SHORT_LABELS[mode]
    : DESK_SHORT_LABELS.sales;
  const ActiveIcon = activeAction?.icon;

  if (!shouldShowNewMenu(role)) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        View only — you can review figures under Reports and the dashboard, but
        recording is limited to users with operations access.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
        <nav
          aria-label="Record type"
          className="flex shrink-0 gap-1 overflow-x-auto pb-1 lg:w-44 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0"
        >
          {primaryActions.map((action) => (
            <DeskModeButton
              key={action.id}
              action={action}
              label={DESK_SHORT_LABELS[action.id as RecordDeskMode]}
              active={mode === action.id}
              onSelect={() => {
                setMode(action.id as RecordDeskMode);
                setMoreOpen(false);
              }}
            />
          ))}

          {moreActions.length > 0 && (
            <div
              className={cn(
                "mt-0 border-border lg:mt-2 lg:border-t lg:pt-2",
                moreActions.length === 1 && "lg:mt-2 lg:border-t lg:pt-2",
              )}
            >
              {moreActions.length === 1 && (
                <DeskExtraButton
                  action={moreActions[0]!}
                  label={morePillLabel(moreActions[0]!)}
                  onOpen={() => openRecordAction(moreActions[0]!.id)}
                />
              )}

              {moreActions.length > 1 && (
                <div ref={moreRef} className="relative">
                  <button
                    type="button"
                    className={cn(
                      "flex w-full min-w-[8.5rem] items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors lg:min-w-0",
                      moreOpen
                        ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                    aria-expanded={moreOpen}
                    aria-haspopup="menu"
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
                      className="absolute left-0 top-full z-30 mt-1.5 min-w-[11rem] overflow-hidden rounded-md border border-border bg-card py-1 shadow-[var(--shadow-pop)] lg:left-full lg:top-0 lg:ml-1.5 lg:mt-0"
                    >
                      {moreSections.map((group, index) => (
                        <div
                          key={group.section}
                          className={cn(
                            index > 0 && "mt-0.5 border-t border-border pt-0.5",
                          )}
                        >
                          {moreSections.length > 1 && (
                            <p className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {RECORD_SECTION_LABELS[group.section]}
                            </p>
                          )}
                          {group.actions.map((action) => (
                            <MoreActionButton
                              key={action.id}
                              action={action}
                              onOpen={() => {
                                closeMore();
                                openRecordAction(action.id);
                              }}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </nav>

        <section className="min-w-0 flex-1 lg:max-w-2xl">
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <header className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2.5">
                {ActiveIcon && (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <ActiveIcon className="size-4" aria-hidden />
                  </span>
                )}
                <div className="min-w-0">
                  <h2 className="text-base font-semibold leading-tight">
                    {activeLabel}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {activeHint}
                  </p>
                </div>
              </div>
            </header>

            <div className="p-4">
              {mode === "expense" && (
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

              {mode === "staffSalary" && (
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

              {mode === "sales" && (
                <ManualDailySalesForm
                  embedded
                  open
                  onClose={() => undefined}
                  onSaved={onRecorded}
                />
              )}

              {mode === "fx" && (
                <FxUnifiedDialog
                  embedded
                  open
                  onClose={() => undefined}
                  onSaved={onRecorded}
                />
              )}

              {mode === "addDocument" && (
                <AddDocumentDialog
                  embedded
                  open
                  deliveryEnabled={deliveryEnabled}
                  onClose={() => undefined}
                  onConfirm={handleDocumentConfirm}
                  onOpenDeliveryReport={() => openRecordAction("deliveryReport")}
                />
              )}

              {mode === "closeDay" && (
                <CashDrawerCloseDayForm
                  embedded
                  open
                  onClose={() => undefined}
                  onClosed={onRecorded}
                />
              )}
            </div>
          </div>
        </section>
      </div>

      {entityId && <RecordedTodayCard entityId={entityId} />}
    </div>
  );
}

function DeskModeButton({
  action,
  label,
  active,
  onSelect,
}: {
  action: RecordActionDef;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        "flex min-w-[8.5rem] shrink-0 items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors lg:min-w-0 lg:w-full",
        active
          ? "bg-primary/10 text-primary ring-1 ring-primary/20"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
      onClick={onSelect}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          active ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="leading-tight">{label}</span>
    </button>
  );
}

function DeskExtraButton({
  action,
  label,
  onOpen,
}: {
  action: RecordActionDef;
  label: string;
  onOpen: () => void;
}) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      className="flex w-full min-w-[8.5rem] shrink-0 items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground lg:min-w-0"
      onClick={onOpen}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="leading-tight">{label}</span>
    </button>
  );
}

function morePillLabel(action: RecordActionDef): string {
  if (action.id === "partnerReimbursement") return "Partner reimb.";
  return action.label;
}

function MoreActionButton({
  action,
  onOpen,
}: {
  action: RecordActionDef;
  onOpen: () => void;
}) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted/60"
      onClick={onOpen}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="font-medium leading-tight">{action.label}</span>
    </button>
  );
}
