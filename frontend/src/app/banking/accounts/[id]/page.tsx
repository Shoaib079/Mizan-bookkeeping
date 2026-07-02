"use client";

/** Money account detail — statements, transfers — Phase 9 Slice 4. */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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
import type { BankStatementRead, MoneyAccountRead } from "@/lib/banking-types";
import { formatFxNative } from "@/lib/fx-money";
import { useEntity } from "@/lib/entity-context";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { formatTrDate, formatTry } from "@/lib/money";

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const accountId = params.id;
  const { entityId } = useEntity();
  const [account, setAccount] = useState<MoneyAccountRead | null>(null);
  const [statements, setStatements] = useState<BankStatementRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const resetDetailState = useCallback(() => {
    setAccount(null);
    setStatements([]);
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
      } else {
        setStatements([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, accountId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!entityId) {
    return (
      <>
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      </>
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
                {account.account_kind.replace(/_/g, " ")}
                {account.bank_name && ` · ${account.bank_name}`}
                {account.iban && ` · ${account.iban}`}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {balanceDisplay}
              </p>
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
              <Button
                variant="secondary"
                onClick={() => setTransferOpen(true)}
              >
                Transfer
              </Button>
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
