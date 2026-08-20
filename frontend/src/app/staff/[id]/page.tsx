"use client";

/** Staff detail — DESIGN_ARCHETYPES §2 (`EntityDetailPage`). */

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EmployeeForm, type EmployeeRow } from "@/components/forms/employee-form";
import { StaffAccrualForm } from "@/components/forms/staff-accrual-form";
import { StaffCashMovementForm } from "@/components/forms/staff-cash-movement-form";
import { StaffAdvanceReturnForm } from "@/components/forms/staff-advance-return-form";
import { staffDisplayRows } from "@/lib/staff-ledger-display";
import { StaffExtraDaysForm } from "@/components/forms/staff-extra-days-form";
import { StaffSalaryPaymentDialog } from "@/components/forms/staff-salary-payment-dialog";
import {
  GlEditDialogs,
  type GlEditTarget,
} from "@/components/ledger/gl-edit-dialogs";
import { SubledgerDownloadMenu } from "@/components/ledger/subledger-download-menu";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { ActionsUnavailableNotice } from "@/components/ledger/actions-unavailable-notice";
import { SubledgerActionsCell } from "@/components/ledger/subledger-actions-cell";
import { editTargetFor } from "@/lib/gl-edit-target";
import { useEntryActions, type EntryActions } from "@/lib/use-entry-actions";
import { EditedBadge } from "@/components/ledger/corrected-badge";
import { AppShell } from "@/components/layout/app-shell";
import {
  DetailSection,
  EntityDetailPage,
} from "@/components/page/entity-detail-page";
import { LedgerTable } from "@/components/page/ledger-table";
import { EditTitleButton, MetaFacts } from "@/components/page/page-header";
import { EntityBalanceSticker } from "@/components/entity-balance-sticker";
import { Button } from "@/components/ui/button";
import {
  DataTableCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch, entityPath } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  netPositionCaption,
  netPositionReconciles,
  netsOutVisibly,
  staffBalanceHeading,
  staffNetPosition,
} from "@/lib/staff-net-position";
import { staffMovementLabels } from "@/lib/subledger-labels";
import {
  subledgerRowClassName,
  type SubledgerDisplayKind,
} from "@/lib/ledger-display";
import { useLedgerHistoryView } from "@/lib/use-ledger-history-view";
import { extraDaysLabel, salaryPeriodLabel } from "@/lib/staff-ledger-labels";

type StaffLedgerEntry = {
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

/** The correction forms reachable from here. A partner-funded salary appears
 * on this page too, and is opened by the same translation the General ledger
 * uses rather than a rule kept here. */
const PAGE_EDIT_KINDS = ["staff_ledger", "partner_funded_salary"] as const;

type StaffLedgerResponse = {
  balance_minor: number;
  remaining_accrual_minor: number;
  outstanding_advance_minor: number;
  entries: StaffLedgerEntry[];
  /** Verdicts for the rows below. Absent from an older backend, in which case
   * the page asks separately rather than deciding for itself. */
  entry_actions?: Record<string, EntryActions>;
};

export default function StaffDetailPage() {
  const params = useParams<{ id: string }>();
  const employeeId = params.id;
  const { entityId } = useEntity();

  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [ledger, setLedger] = useState<StaffLedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [accrualOpen, setAccrualOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [extraDaysOpen, setExtraDaysOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<GlEditTarget | null>(null);
  // The path comes from the backend: a partner-funded salary voids at its own
  // dual-subledger route, not at the staff one this page used to assume.
  const [voidTarget, setVoidTarget] = useState<{
    path: string;
    description: string;
  } | null>(null);

  const reload = useCallback(async () => {
    if (!entityId || !employeeId) return;
    setLoading(true);
    setError(null);
    try {
      const [emp, led] = await Promise.all([
        apiFetch<EmployeeRow>(
          `/entities/${entityId}/staff/employees/${employeeId}`,
        ),
        apiFetch<StaffLedgerResponse>(
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
  // Asked of the backend, never decided here. The ledger sends the verdicts
  // with its rows; the ids are still passed for the fallback against a backend
  // that has not been redeployed.
  const { rowActions, failed: actionsFailed, retry: retryActions } = useEntryActions(
    entityId,
    useMemo(
      () =>
        displayRows
          .map((group) => group.primary.journal_entry_id)
          .filter((id): id is string => Boolean(id)),
      [displayRows],
    ),
    ledger?.entry_actions,
  );

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
          { label: "Adjust accrual", onSelect: () => setAccrualOpen(true) },
        ]}
        titleAction={<EditTitleButton onClick={() => setEditOpen(true)} />}
        balance={
          ledger && (
            <EntityBalanceSticker
              label={staffBalanceHeading(position)}
              // Ledger net (= directory/hub balance_minor), not salary−advance.
              signedBalanceMinor={position.netMinor}
              format={formatMinorAmount}
              details={
                (netsOutVisibly(position) ||
                  !netPositionReconciles(position)) && (
                  <div className="space-y-0.5">
                    {position.salaryOwedMinor > 0 && (
                      <p>Salary owed: {formatMinorAmount(position.salaryOwedMinor)}</p>
                    )}
                    {position.advanceHeldMinor > 0 && (
                      <p>
                        Advance held: −
                        {formatMinorAmount(position.advanceHeldMinor)}
                      </p>
                    )}
                    {!netPositionReconciles(position) && (
                      <p>
                        Other movements:{" "}
                        {formatMinorAmount(position.otherMinor)}
                      </p>
                    )}
                    <p className="pt-0.5">{netPositionCaption(position)}</p>
                  </div>
                )
              }
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
                notice={
                  actionsFailed && (
                    <ActionsUnavailableNotice onRetry={retryActions} />
                  )
                }
                history={{ hiddenCount, showHistory, onToggle: setShowHistory }}
                filteredMessage="No current entries in this period — show correction history to see voided rows."
              >
                {displayRows.map((group) => {
                  const entry = group.primary;
                  const asked = rowActions(entry.journal_entry_id);
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
                        <SubledgerActionsCell
                          row={entry}
                          actions={asked}
                          opensEditKinds={PAGE_EDIT_KINDS}
                          ownerNoun="employees"
                          onEdit={(edit) =>
                            setEditTarget(
                              editTargetFor(
                                edit.kind,
                                edit.context,
                                entry.journal_entry_id!,
                              ),
                            )
                          }
                          onVoid={(voidPath) =>
                            setVoidTarget({
                              path: entityPath(entityId, voidPath),
                              description: entry.description,
                            })
                          }
                        />
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
            title="Void staff movement"
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
