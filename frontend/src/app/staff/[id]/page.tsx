"use client";

/** Staff detail — DESIGN_ARCHETYPES §2 (`EntityDetailPage`). */

import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

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
import { StaffDetailLedger } from "@/components/staff/staff-detail-ledger";
import { SubledgerDownloadMenu } from "@/components/ledger/subledger-download-menu";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { useEntryActions, type EntryActions } from "@/lib/use-entry-actions";
import { AppShell } from "@/components/layout/app-shell";
import {
  EntityDetailPage,
} from "@/components/page/entity-detail-page";
import { EditTitleButton, MetaFacts } from "@/components/page/page-header";
import { EntityBalanceSticker } from "@/components/entity-balance-sticker";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useWriteChrome } from "@/lib/use-write-chrome";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import {
  netPositionCaption,
  netPositionReconciles,
  netsOutVisibly,
  staffBalanceHeading,
  staffNetPosition,
} from "@/lib/staff-net-position";
import { type SubledgerDisplayKind } from "@/lib/ledger-display";
import { useLedgerHistoryView } from "@/lib/use-ledger-history-view";

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
  const { showWrite } = useWriteChrome();

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

  const detailEnabled = Boolean(entityId && employeeId);

  const employeeQuery = useQuery({
    queryKey: ["staff", entityId, employeeId],
    enabled: detailEnabled,
    queryFn: () =>
      apiFetch<EmployeeRow>(
        `/entities/${entityId}/staff/employees/${employeeId}`,
      ),
  });
  const ledgerQuery = useQuery({
    queryKey: ["staff", entityId, employeeId, "ledger"],
    enabled: detailEnabled,
    queryFn: () =>
      apiFetch<StaffLedgerResponse>(
        `/entities/${entityId}/staff/employees/${employeeId}/ledger`,
      ),
  });

  const employee = employeeQuery.data ?? null;
  const ledger = ledgerQuery.data ?? null;
  const loading = employeeQuery.isPending || ledgerQuery.isPending;
  const error =
    employeeQuery.error instanceof Error
      ? employeeQuery.error.message
      : ledgerQuery.error instanceof Error
        ? ledgerQuery.error.message
        : null;

  const reload = useCallback(async () => {
    await Promise.all([employeeQuery.refetch(), ledgerQuery.refetch()]);
  }, [employeeQuery, ledgerQuery]);

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
          showWrite ? (
            <Button type="button" onClick={() => setPaymentOpen(true)}>
              Pay salary
            </Button>
          ) : undefined
        }
        actions={
          <>
            {showWrite && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAdvanceOpen(true)}
              >
                Give advance
              </Button>
            )}
            <SubledgerDownloadMenu
              basePath={
                entityId && employeeId
                  ? `/entities/${entityId}/staff/employees/${employeeId}/ledger`
                  : null
              }
            />
          </>
        }
        overflowActions={
          showWrite
            ? [
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
                  label: "Adjust accrual",
                  onSelect: () => setAccrualOpen(true),
                },
              ]
            : []
        }
        titleAction={
          showWrite ? (
            <EditTitleButton onClick={() => setEditOpen(true)} />
          ) : undefined
        }
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
            <StaffDetailLedger
              displayRows={displayRows}
              isEmpty={ledger.entries.length === 0}
              isFiltered={visibleRows.length === 0}
              hiddenCount={hiddenCount}
              showHistory={showHistory}
              onToggleHistory={setShowHistory}
              actionsFailed={actionsFailed}
              onRetryActions={retryActions}
              entityId={entityId}
              formatMinorAmount={formatMinorAmount}
              opensEditKinds={PAGE_EDIT_KINDS}
              rowActions={rowActions}
              onEditTarget={setEditTarget}
              onVoidTarget={setVoidTarget}
            />
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
