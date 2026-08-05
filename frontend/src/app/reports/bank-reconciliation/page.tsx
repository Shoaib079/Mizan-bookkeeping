"use client";

/** Bank reconciliation — does each bank account agree with the bank?
 *
 * The cash book proves the drawer by counting it; a bank account is proved by
 * agreeing with the bank's own record. Shows what's left to review per account,
 * and — when the bank's stated closing balance is known — whether lines are
 * missing from the import entirely. */

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";

import { isForbiddenError } from "@/components/reports/forbidden-message";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ReportPage } from "@/components/page/report-page";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Landmark } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry, parseTryToKurus } from "@/lib/money";
import type {
  BankReconciliationAccount,
  BankReconciliationRead,
} from "@/lib/report-types";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { cn } from "@/lib/utils";

function AccountCard({
  account,
  entityId,
  onSaved,
}: {
  account: BankReconciliationAccount;
  entityId: string;
  onSaved: () => void;
}) {
  const submitIdempotency = useSubmitIdempotency();
  const [balanceText, setBalanceText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = account.missing_from_import_kurus;
  const hasMissing = missing !== null && missing !== 0;

  async function saveStatedBalance() {
    if (!account.latest_statement_id) return;
    const kurus = parseTryToKurus(balanceText);
    if (kurus === null) {
      setError("Enter the closing balance from your statement.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/banking/statements/${account.latest_statement_id}/closing-balance`,
        {
          method: "PATCH",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ closing_balance_kurus: kurus }),
        },
      );
      submitIdempotency.completeSubmit();
      setBalanceText("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            <Link
              href={`/banking/accounts/${account.money_account_id}`}
              className="text-primary hover:underline"
            >
              {account.name}
            </Link>
          </p>
          {account.statement_period_end ? (
            <p className="text-xs text-muted-foreground">
              Latest statement to {formatTrDate(account.statement_period_end)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No statement imported</p>
          )}
        </div>
        <span
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium",
            account.is_reconciled
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning",
          )}
        >
          {account.is_reconciled
            ? "Reconciled"
            : `${account.unreconciled_count} line${account.unreconciled_count === 1 ? "" : "s"} to review`}
        </span>
      </div>

      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">
            Your books say
            {account.book_balance_as_of && (
              <span className="block text-[11px] font-normal">
                to {formatTrDate(account.book_balance_as_of)}
              </span>
            )}
          </dt>
          <dd className="tabular-nums">{formatTry(account.book_balance_kurus)}</dd>
        </div>
        {account.unreconciled_total_kurus !== 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              Not yet classified ({account.unreconciled_count})
            </dt>
            <dd className="tabular-nums">
              {formatTry(account.unreconciled_total_kurus)}
            </dd>
          </div>
        )}
        {account.stated_closing_balance_kurus !== null && (
          <div className="flex justify-between gap-4 border-t border-border pt-1">
            <dt className="text-muted-foreground">Bank statement says</dt>
            <dd className="tabular-nums">
              {formatTry(account.stated_closing_balance_kurus)}
            </dd>
          </div>
        )}
        {hasMissing && (
          <div className="flex justify-between gap-4 rounded-md bg-destructive/10 px-2 py-1 text-destructive">
            <dt className="font-medium">
              Unexplained vs statement closing
              <span className="block text-[11px] font-normal text-destructive/90">
                Check opening balance, missing import lines, or activity after the
                statement period
              </span>
            </dt>
            <dd className="font-medium tabular-nums">{formatTry(missing)}</dd>
          </div>
        )}
      </dl>

      {account.stated_closing_balance_kurus === null &&
        account.latest_statement_id && (
          <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
            <Label htmlFor={`bal-${account.money_account_id}`}>
              Closing balance on your statement (optional)
            </Label>
            <p className="mb-2 mt-1 text-xs text-muted-foreground">
              Enter what the bank printed and Mizan can also catch transactions
              missing from the imported file — not just unclassified lines.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <MoneyInput
                id={`bal-${account.money_account_id}`}
                className="w-44"
                placeholder="e.g. 46.680,00"
                value={balanceText}
                onChange={setBalanceText}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => void saveStatedBalance()}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </div>
        )}

      {account.lines.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Lines still to review</h3>
            <Link
              href="/review/bank"
              className="text-sm text-primary hover:underline"
            >
              Review them →
            </Link>
          </div>
          <DataTable>
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Date</DataTableHeaderCell>
                <DataTableHeaderCell>Description</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {account.lines.map((line) => (
                <DataTableRow key={line.id}>
                  <DataTableCell>
                    {formatTrDate(line.transaction_date)}
                  </DataTableCell>
                  <DataTableCell>{line.description}</DataTableCell>
                  <DataTableCell align="right" className="tabular-nums">
                    {formatTry(line.amount_kurus)}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        </div>
      )}
    </section>
  );
}

function BankReconciliationContent() {
  const { entityId } = useEntity();
  const [report, setReport] = useState<BankReconciliationRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const reload = useCallback(async () => {
    if (!entityId) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const res = await apiFetch<BankReconciliationRead>(
        `/entities/${entityId}/reports/bank-reconciliation`,
      );
      setReport(res);
    } catch (err) {
      if (isForbiddenError(err)) {
        setForbidden(true);
        setReport(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load");
        setReport(null);
      }
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const allDone =
    report !== null &&
    report.accounts.length > 0 &&
    report.accounts.every((a) => a.is_reconciled);

  return (
    <AppShell title="Bank reconciliation">
      <ReportPage
        title="Bank reconciliation"
        entityId={entityId}
        loading={loading}
        error={error}
        forbidden={forbidden}
        forbiddenContext="bank reconciliation"
        hasReport={Boolean(report)}
        meta={
          <>
            Whether each bank account agrees with the bank. Unclassified lines are
        still outstanding. If you already recorded an expense from that bank
        (e.g. SGK), classify the matching statement line as{" "}
        <strong>Expense from bank</strong> with the same expense account — Mizan
        links it instead of posting twice.
          </>
        }
      >

      {report && (
        <>
          {allDone && (
            <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              Every account is reconciled — books and bank agree.
            </p>
          )}
          {report.accounts.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="No bank accounts yet"
              hint="Add a bank account under Banking, then import a statement."
            />
          ) : (
            <div className="space-y-4">
              {report.accounts.map((account) => (
                <AccountCard
                  key={account.money_account_id}
                  account={account}
                  entityId={entityId ?? ""}
                  onSaved={() => void reload()}
                />
              ))}
            </div>
          )}
        </>
      )}
      </ReportPage>
    </AppShell>
  );
}

export default function BankReconciliationPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BankReconciliationContent />
    </Suspense>
  );
}
