"use client";

/** Staff detail — DESIGN_ARCHETYPES §2 (`EntityDetailPage`). */

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EmployeeForm, type EmployeeRow } from "@/components/forms/employee-form";
import { StaffAccrualForm } from "@/components/forms/staff-accrual-form";
import { StaffCashMovementForm } from "@/components/forms/staff-cash-movement-form";
import { StaffAdvanceReturnForm } from "@/components/forms/staff-advance-return-form";
import { StaffApplyAdvanceForm } from "@/components/forms/staff-apply-advance-form";
import { staffDisplayRows } from "@/lib/staff-ledger-display";
import { StaffExtraDaysForm } from "@/components/forms/staff-extra-days-form";
import { StaffSalaryPaymentDialog } from "@/components/forms/staff-salary-payment-dialog";
import {
  CorrectStaffLedgerForm,
  type CorrectableStaffLedgerRow,
} from "@/components/forms/correct-staff-ledger-form";
import { SubledgerDownloadMenu } from "@/components/ledger/subledger-download-menu";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { EditedBadge } from "@/components/ledger/corrected-badge";
import { AppShell } from "@/components/layout/app-shell";
import {
  DetailSection,
  EntityDetailPage,
} from "@/components/page/entity-detail-page";
import { LedgerTable } from "@/components/page/ledger-table";
import { MetaFacts } from "@/components/page/page-header";
import { HeadlineFigure, SummaryPanel } from "@/components/page/summary-panel";
import { Button } from "@/components/ui/button";
import {
  DataTableCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  netPositionCaption,
  netPositionReconciles,
  staffNetPosition,
} from "@/lib/staff-net-position";
import { staffMovementLabels } from "@/lib/subledger-labels";
import {
  subledgerRowClassName,
  type SubledgerDisplayKind,
} from "@/lib/ledger-display";
import { staffLedgerRowActions } from "@/lib/subledger-actions";
import { useLedgerHistoryView } from "@/lib/use-ledger-history-view";

type LedgerEntry = {
  id: string;
  movement_date: string;
  movement_type: string;
  amount_minor: number;
  description: string;
  journal_entry_id: string | null;
  payment_account_id: string | null;
  period_year?: number | null;
  period_month?: number | null;
  extra_days?: number | null;
  display_kind: SubledgerDisplayKind;
  was_corrected?: boolean;
};

const MONTH_NAMES = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type LedgerResponse = {
  balance_minor: number;
  remaining_accrual_minor: number;
  outstanding_advance_minor: number;
  entries: LedgerEntry[];
};

function extraDaysLabel(entry: LedgerEntry): string | null {
  if (
    entry.movement_type !== "extra_days_paid" &&
    entry.movement_type !== "extra_days_accrued"
  ) {
    return null;
  }
  if (!entry.extra_days) return null;
  return `${entry.extra_days} day${entry.extra_days === 1 ? "" : "s"}`;
}

function salaryPeriodLabel(entry: LedgerEntry): string | null {
  if (entry.movement_type !== "salary_accrued") return null;
  if (!entry.period_year || !entry.period_month) return null;
  const month = MONTH_NAMES[entry.period_month] ?? String(entry.period_month);
  return `${month} ${entry.period_year}`;
}

export default function StaffDetailPage() {
  const params = useParams<{ id: string }>();
  const employeeId = params.id;
  const { entityId } = useEntity();

  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [accrualOpen, setAccrualOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [applyAdvanceOpen, setApplyAdvanceOpen] = useState(false);
  const [extraDaysOpen, setExtraDaysOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [correctEntry, setCorrectEntry] = useState<CorrectableStaffLedgerRow | null>(null);
  const [voidTarget, setVoidTarget] = useState<{
    journal_entry_id: string;
    description: string;
  } | null>(null);

  const resetDetailState = useCallback(() => {
    setEmployee(null);
    setLedger(null);
    setLoading(true);
    setError(null);
    setEditOpen(false);
    setAccrualOpen(false);
    setAdvanceOpen(false);
    setReturnOpen(false);
    setApplyAdvanceOpen(false);
    setExtraDaysOpen(false);
    setPaymentOpen(false);
    setCorrectEntry(null);
    setVoidTarget(null);
  }, []);

  useEntitySwitchReset(entityId, resetDetailState);

  const reload = useCallback(async () => {
    if (!entityId || !employeeId) return;
    setLoading(true);
    setError(null);
    try {
      const [emp, led] = await Promise.all([
        apiFetch<EmployeeRow>(
          `/entities/${entityId}/staff/employees/${employeeId}`,
        ),
        apiFetch<LedgerResponse>(
          `/entities/${entityId}/staff/employees/${employeeId}/ledger`,
        ),
      ]);
      setEmployee(emp);
      setLedger(led);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, employeeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const {
    showHistory,
    setShowHistory,
    hiddenCount,
    visibleRows,
  } = useLedgerHistoryView(ledger?.entries ?? []);

  // One display row per real event: rows written under the same journal entry
  // (salary payment + advance applied) collapse into a single net line, so an
  // advance offset no longer masquerades as a second "Salary payment".
  const displayRows = useMemo(() => staffDisplayRows(visibleRows), [visibleRows]);

  const formatMinorAmount = useCallback(
    (minor: number) =>
      employee?.pay_currency === "TRY"
        ? formatTry(minor)
        : `${(minor / 100).toFixed(2)} ${employee?.pay_currency ?? ""}`,
    [employee?.pay_currency],
  );

  /** `balance_minor` already nets advances against salary — see
   * lib/staff-net-position.ts for why subtracting the advance from it counted
   * the same money twice. */
  const position = staffNetPosition(ledger);

  if (!entityId) {
    return (
      <AppShell title="Staff">
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      </AppShell>
    );
  }

  const isTry = employee?.pay_currency === "TRY";
  const hasAdvance = (ledger?.outstanding_advance_minor ?? 0) > 0;

  return (
    <AppShell title={employee?.name ?? "Employee"}>
      <EntityDetailPage
        title={employee?.name ?? "Employee"}
        loading={loading}
        error={error}
        meta={
          employee && (
            <MetaFacts
              items={[
                <StatusBadge
                  key="status"
                  status={employee.is_active ? "active" : "inactive"}
                />,
                `Paid in ${employee.pay_currency}`,
                employee.notes,
              ].filter(Boolean)}
            />
          )
        }
        primaryAction={
          <Button type="button" onClick={() => setPaymentOpen(true)}>
            Pay salary
          </Button>
        }
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAdvanceOpen(true)}
            >
              Give advance
            </Button>
            <SubledgerDownloadMenu
              basePath={
                entityId && employeeId
                  ? `/entities/${entityId}/staff/employees/${employeeId}/ledger`
                  : null
              }
            />
          </>
        }
        overflowActions={[
          {
            label: "Extra days",
            show: isTry,
            onSelect: () => setExtraDaysOpen(true),
          },
          {
            label: "Return advance",
            title:
              "Record cash returned by the employee for an advance/overpayment",
            show: isTry && hasAdvance,
            onSelect: () => setReturnOpen(true),
          },
          {
            label: "Apply advance (no cash)",
            title:
              "Net advance against unpaid salary without paying cash — normally automatic at Pay salary",
            show:
              isTry && hasAdvance && (ledger?.remaining_accrual_minor ?? 0) > 0,
            onSelect: () => setApplyAdvanceOpen(true),
          },
          { label: "Adjust accrual", onSelect: () => setAccrualOpen(true) },
          { label: "Edit employee", onSelect: () => setEditOpen(true) },
        ]}
        headline={
          ledger && (
            <HeadlineFigure
              label="Net to pay"
              amountKurus={position.netToPayMinor}
              caption={netPositionCaption(position)}
              format={formatMinorAmount}
            />
          )
        }
        panels={
          ledger && (
            <SummaryPanel
              title="How that nets out"
              format={formatMinorAmount}
              lines={[
                { label: "Salary owed", amountKurus: position.salaryOwedMinor },
                {
                  label: "Advance held",
                  amountKurus: position.advanceHeldMinor,
                  negative: position.advanceHeldMinor > 0,
                },
                {
                  label: "Other movements",
                  amountKurus: position.otherMinor,
                  hideWhenZero: netPositionReconciles(position),
                },
              ]}
              total={{ label: "Net to pay", amountKurus: position.netToPayMinor }}
            />
          )
        }
        activity={
          ledger &&
          employee && (
            <DetailSection title="Ledger">
              <LedgerTable
                columns={[
                  { key: "date", label: "Date" },
                  { key: "type", label: "Type" },
                  { key: "description", label: "Description" },
                  { key: "amount", label: "Amount", align: "right" },
                  { key: "balance", label: "Balance", align: "right" },
                ]}
                hasActions
                isEmpty={ledger.entries.length === 0}
                isFiltered={visibleRows.length === 0}
                history={{ hiddenCount, showHistory, onToggle: setShowHistory }}
                filteredMessage="No current entries in this period — show correction history to see voided rows."
              >
                {displayRows.map((group) => {
                  const entry = group.primary;
                  const actions = staffLedgerRowActions({
                    movementType: entry.movement_type,
                    payCurrency: employee.pay_currency,
                    isAdvanceOffset: group.isAdvanceOffset,
                    advanceAppliedMinor: group.advanceAppliedMinor,
                  });
                  const canAct = actions.canEdit || actions.canVoid;
                  return (
                    <DataTableRow
                      key={entry.id}
                      className={subledgerRowClassName(entry.display_kind)}
                    >
                      <DataTableCell>
                        {formatTrDate(entry.movement_date)}
                      </DataTableCell>
                      <DataTableCell>
                        {group.isAdvanceOffset
                          ? "Advance applied"
                          : (staffMovementLabels[entry.movement_type] ??
                            entry.movement_type)}
                        {!group.isAdvanceOffset && salaryPeriodLabel(entry) && (
                          <span className="ml-1 text-muted-foreground">
                            ({salaryPeriodLabel(entry)})
                          </span>
                        )}
                        {extraDaysLabel(entry) && (
                          <span className="ml-1 text-muted-foreground">
                            ({extraDaysLabel(entry)})
                          </span>
                        )}
                      </DataTableCell>
                      <DataTableCell>
                        {group.isAdvanceOffset
                          ? "Advance applied to salary"
                          : entry.description}
                        {group.advanceAppliedMinor > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {group.isAdvanceOffset
                              ? `${formatMinorAmount(group.advanceAppliedMinor)} from advance — no cash`
                              : `incl. ${formatMinorAmount(group.advanceAppliedMinor)} from advance`}
                          </span>
                        )}
                        {group.advanceCreatedMinor > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            incl. {formatMinorAmount(group.advanceCreatedMinor)}{" "}
                            held as advance
                          </span>
                        )}
                        {entry.was_corrected && (
                          <span className="ml-2">
                            <EditedBadge />
                          </span>
                        )}
                      </DataTableCell>
                      <DataTableCell align="right">
                        {formatMinorAmount(group.netMinor)}
                      </DataTableCell>
                      <DataTableCell align="right" className="tabular-nums text-muted-foreground">
                        {group.balanceMinor === null
                          ? "—"
                          : formatMinorAmount(group.balanceMinor)}
                      </DataTableCell>
                      <DataTableCell>
                        {canAct && (
                          <SubledgerRowActions
                            row={entry}
                            showEdit={actions.canEdit}
                            onEdit={() =>
                              setCorrectEntry({
                                journal_entry_id: entry.journal_entry_id!,
                                movement_date: entry.movement_date,
                                movement_type: entry.movement_type,
                                amount_minor: entry.amount_minor,
                                description: entry.description,
                                payment_account_id: entry.payment_account_id,
                                extra_days: entry.extra_days,
                              })
                            }
                            onVoid={() =>
                              setVoidTarget({
                                journal_entry_id: entry.journal_entry_id!,
                                description: entry.description,
                              })
                            }
                          />
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  );
                })}
              </LedgerTable>
            </DetailSection>
          )
        }
      >
        {employee && entityId && (
          <>
            <EmployeeForm
            open={editOpen}
            employee={employee}
            onClose={() => setEditOpen(false)}
            onSaved={() => void reload()}
          />
          <StaffAccrualForm
            open={accrualOpen}
            employeeId={employeeId}
            payCurrency={employee.pay_currency}
            defaultSalaryPeriod="prior"
            onClose={() => setAccrualOpen(false)}
            onSaved={() => void reload()}
          />
          <StaffCashMovementForm
            open={advanceOpen}
            employeeId={employeeId}
            payCurrency={employee.pay_currency}
            onClose={() => setAdvanceOpen(false)}
            onSaved={() => void reload()}
          />
          <StaffAdvanceReturnForm
            open={returnOpen}
            employeeId={employeeId}
            onClose={() => setReturnOpen(false)}
            onSaved={() => void reload()}
          />
          <StaffApplyAdvanceForm
            open={applyAdvanceOpen}
            employeeId={employeeId}
            outstandingAdvanceMinor={ledger?.outstanding_advance_minor ?? 0}
            onClose={() => setApplyAdvanceOpen(false)}
            onSaved={() => void reload()}
          />
          <StaffExtraDaysForm
            open={extraDaysOpen}
            employeeId={employeeId}
            onClose={() => setExtraDaysOpen(false)}
            onSaved={() => void reload()}
          />
          <StaffSalaryPaymentDialog
            open={paymentOpen}
            onClose={() => setPaymentOpen(false)}
            entityId={entityId}
            employeeId={employeeId}
            employeeName={employee.name}
            payCurrency={employee.pay_currency}
            source="staff"
            onSaved={() => void reload()}
          />
          <CorrectStaffLedgerForm
            open={correctEntry !== null}
            employeeId={employeeId}
            entry={correctEntry}
            onClose={() => setCorrectEntry(null)}
            onSaved={() => void reload()}
          />
          <VoidSubledgerDialog
            open={voidTarget !== null}
            title="Void staff movement"
            description={voidTarget?.description}
            voidPath={
              entityId && voidTarget
                ? `/entities/${entityId}/staff/employees/${employeeId}/ledger/${voidTarget.journal_entry_id}/void`
                : null
            }
            onClose={() => setVoidTarget(null)}
            onSaved={() => void reload()}
          />
          </>
        )}
      </EntityDetailPage>
    </AppShell>
  );
}
