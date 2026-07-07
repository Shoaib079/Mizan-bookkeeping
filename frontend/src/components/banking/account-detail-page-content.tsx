"use client";

/** Money account detail — statements, card payments, transfers — Phase 9 Slice 4. */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ReportDateRange } from "@/components/reports/report-date-range";
import { TransferForm } from "@/components/forms/transfer-form";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { apiFetch } from "@/lib/api";
import type {
  BankStatementRead,
  CreditCardPaymentRead,
  MoneyAccountRead,
} from "@/lib/banking-types";
import { formatFxNative } from "@/lib/fx-money";
import { useEntity } from "@/lib/entity-context";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { formatTrDate, formatTry } from "@/lib/money";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

export function AccountDetailPageContent() {
  const params = useParams<{ id: string }>();
  const accountId = params.id;
  const { entityId } = useEntity();
  const { from, to, setRange } = useReportRangeFromUrl();
  const [account, setAccount] = useState<MoneyAccountRead | null>(null);
  const [statements, setStatements] = useState<BankStatementRead[]>([]);
  const [cardPayments, setCardPayments] = useState<CreditCardPaymentRead[]>([]);
  const [bankNames, setBankNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const cardPaymentsQuery = useMemo(() => {
    const params = new URLSearchParams({ from, to, limit: "50" });
    return params.toString();
  }, [from, to]);

  const resetDetailState = useCallback(() => {
    setAccount(null);
    setStatements([]);
    setCardPayments([]);
    setBankNames({});
    setLoading(true);
    setError(null);
    setTransferOpen(false);
  }, []);

  useEntitySwitchReset(entityId, resetDetailState);

  const reload = useCallback(async () => {
    if (!entityId || !accountId) return;
    setLoading(true);
    setError(null);
    try {
      const acct = await apiFetch<MoneyAccountRead>(
        `/entities/${entityId}/banking/accounts/${accountId}`,
      );
      setAccount(acct);

      if (acct.account_kind === "bank") {
        const stmtRes = await apiFetch<{ items: BankStatementRead[] }>(
          `/entities/${entityId}/banking/accounts/${accountId}/statements?limit=50`,
        );
        setStatements(stmtRes.items);
        setCardPayments([]);
        setBankNames({});
      } else if (acct.account_kind === "credit_card") {
        const [paymentsRes, banksRes] = await Promise.all([
          apiFetch<{ items: CreditCardPaymentRead[] }>(
            `/entities/${entityId}/banking/accounts/${accountId}/credit-card-payments?${cardPaymentsQuery}`,
          ),
          apiFetch<{ items: MoneyAccountRead[] }>(
            `/entities/${entityId}/banking/accounts?account_kind=bank&limit=50`,
          ),
        ]);
        setCardPayments(paymentsRes.items);
        const names: Record<string, string> = {};
        for (const bank of banksRes.items) names[bank.id] = bank.name;
        setBankNames(names);
        setStatements([]);
      } else {
        setStatements([]);
        setCardPayments([]);
        setBankNames({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, accountId, cardPaymentsQuery]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  const balanceDisplay =
    account?.account_kind === "foreign_currency" &&
    account.currency &&
    account.native_quantity !== null
      ? formatFxNative(account.native_quantity, account.currency)
      : account
        ? formatTry(account.balance_kurus)
        : "";

  return (
    <>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading account…</p>
      )}

      {!loading && account && (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {account.account_kind === "credit_card"
                  ? "Credit card payable"
                  : account.account_kind.replace(/_/g, " ")}
                {account.bank_name && ` · ${account.bank_name}`}
                {account.iban && ` · ${account.iban}`}
                {account.last_four && ` ···${account.last_four}`}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {balanceDisplay}
              </p>
              {account.account_kind === "credit_card" && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Card purchases are recorded as expenses. Payments from bank
                  reduce this balance.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {account.account_kind === "bank" && (
                <Link href={`/banking/accounts/${accountId}/import`}>
                  <Button>Upload statement</Button>
                </Link>
              )}
              {account.account_kind === "cash" && (
                <Link href="/banking/cash">
                  <Button variant="secondary">Cash drawer</Button>
                </Link>
              )}
              {account.account_kind === "foreign_currency" && (
                <Link href={`/banking/fx/${account.id}`}>
                  <Button variant="secondary">FX wallet</Button>
                </Link>
              )}
              {account.account_kind !== "credit_card" && (
                <Button
                  variant="secondary"
                  onClick={() => setTransferOpen(true)}
                >
                  Transfer
                </Button>
              )}
            </div>
          </div>

          {account.account_kind === "bank" && (
            <section>
              <h2 className="mb-3 text-sm font-semibold">Statements</h2>
              {statements.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No statements imported yet.
                </p>
              ) : (
                <DataTable>
                  <DataTableHead>
                    <tr>
                      <DataTableHeaderCell>Period</DataTableHeaderCell>
                      <DataTableHeaderCell>File</DataTableHeaderCell>
                      <DataTableHeaderCell align="right">
                        Lines
                      </DataTableHeaderCell>
                    </tr>
                  </DataTableHead>
                  <DataTableBody>
                    {statements.map((stmt) => (
                      <DataTableRow key={stmt.id}>
                        <DataTableCell>
                          <Link
                            href={`/banking/statements/${stmt.id}`}
                            className="text-primary hover:underline"
                          >
                            {formatTrDate(stmt.period_start)} –{" "}
                            {formatTrDate(stmt.period_end)}
                          </Link>
                        </DataTableCell>
                        <DataTableCell>{stmt.original_filename}</DataTableCell>
                        <DataTableCell align="right">
                          {stmt.line_count}
                        </DataTableCell>
                      </DataTableRow>
                    ))}
                  </DataTableBody>
                </DataTable>
              )}
            </section>
          )}

          {account.account_kind === "credit_card" && (
            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <h2 className="text-sm font-semibold">Card payments</h2>
                <ReportDateRange
                  from={from}
                  to={to}
                  disabled={loading}
                  onChange={setRange}
                />
              </div>
              {cardPayments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No bank payments to this card in this date range. Classify an
                  outflow on a bank statement as a credit card bill payment, or
                  record via statement review.
                </p>
              ) : (
                <DataTable>
                  <DataTableHead>
                    <tr>
                      <DataTableHeaderCell>Date</DataTableHeaderCell>
                      <DataTableHeaderCell>Bank account</DataTableHeaderCell>
                      <DataTableHeaderCell>Description</DataTableHeaderCell>
                      <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
                    </tr>
                  </DataTableHead>
                  <DataTableBody>
                    {cardPayments.map((row) => (
                      <DataTableRow key={row.id}>
                        <DataTableCell>
                          {formatTrDate(row.payment_date)}
                        </DataTableCell>
                        <DataTableCell>
                          {bankNames[row.bank_money_account_id] ??
                            row.bank_money_account_id.slice(0, 8)}
                        </DataTableCell>
                        <DataTableCell>{row.description}</DataTableCell>
                        <DataTableCell align="right">
                          {formatTry(row.amount_kurus)}
                        </DataTableCell>
                      </DataTableRow>
                    ))}
                  </DataTableBody>
                </DataTable>
              )}
            </section>
          )}
        </>
      )}

      <TransferForm
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        defaultFromId={accountId}
        onTransferred={() => void reload()}
      />
    </>
  );
}
