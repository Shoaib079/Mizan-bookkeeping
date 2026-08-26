"use client";

/** Money account detail — DESIGN_ARCHETYPES §2 (`EntityDetailPage`). */

import Link from "next/link";
import { Building2, CreditCard } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AccountCardPaymentsList,
  AccountStatementsList,
} from "@/components/banking/account-detail-lists";
import { BankActivityPanel } from "@/components/banking/bank-activity-panel";
import {
  DetailSection,
  EntityDetailPage,
} from "@/components/page/entity-detail-page";
import { MetaFacts } from "@/components/page/page-header";
import { HeadlineFigure } from "@/components/page/summary-panel";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { TransferForm } from "@/components/forms/transfer-form";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import type {
  BankStatementRead,
  CreditCardPaymentRead,
  MoneyAccountRead,
} from "@/lib/banking-types";
import { formatFxNative } from "@/lib/fx-money";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

export function AccountDetailPageContent() {
  const params = useParams<{ id: string }>();
  const accountId = params.id;
  const { entityId } = useEntity();
  const isMobile = useIsMobileShell();
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

  const kindLabel =
    account?.account_kind === "credit_card"
      ? "Credit card payable"
      : (account?.account_kind.replace(/_/g, " ") ?? "");

  return (
    <EntityDetailPage
      title={account?.name ?? "Account"}
      loading={loading}
      error={error}
      meta={
        account && (
          <MetaFacts
            items={[
              kindLabel,
              // Not when it is the title. A bank account's name is its bank,
              // so repeating it here read as the same fact printed twice —
              // the accounts list already applies this rule to its subtitle.
              account.bank_name !== account.name ? account.bank_name : null,
              account.iban,
              account.last_four && `···${account.last_four}`,
            ].filter(Boolean)}
          />
        )
      }
      primaryAction={
        account?.account_kind !== "credit_card" &&
        account && <Button onClick={() => setTransferOpen(true)}>Transfer</Button>
      }
      actions={
        account && (
          <>
            {account.account_kind === "bank" && (
              <Link href={`/banking/accounts/${accountId}/import`}>
                <Button variant="secondary">Upload statement</Button>
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
          </>
        )
      }
      headline={
        account && (
          <HeadlineFigure
            label={
              account.account_kind === "credit_card"
                ? "Card payable"
                : "Current balance"
            }
            icon={
              account.account_kind === "credit_card" ? CreditCard : Building2
            }
            amountKurus={account.balance_kurus}
            format={() => balanceDisplay}
            caption={
              account.account_kind === "credit_card"
                ? "Card purchases post as expenses; bank payments reduce this."
                : undefined
            }
          />
        )
      }
      activity={
        account && (
          <div className="space-y-8">
          {account.account_kind === "bank" && (
            <DetailSection title="Statements">
              {statements.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No statements imported yet.
                </p>
              ) : (
                <AccountStatementsList
                  statements={statements}
                  isMobile={isMobile}
                />
              )}
            </DetailSection>
          )}

          {account.account_kind === "bank" && (
            <BankActivityPanel accountId={accountId} accountName={account.name} />
          )}

          {account.account_kind === "credit_card" && (
            <DetailSection
              title="Card payments"
              controls={
                <ReportDateRange
                  from={from}
                  to={to}
                  disabled={loading}
                  onChange={setRange}
                />
              }
            >
              {cardPayments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No bank payments to this card in this date range. Classify an
                  outflow on a bank statement as a credit card bill payment, or
                  record via statement review.
                </p>
              ) : (
                <AccountCardPaymentsList
                  payments={cardPayments}
                  bankNames={bankNames}
                  isMobile={isMobile}
                />
              )}
            </DetailSection>
          )}
          </div>
        )
      }
    >
      <TransferForm
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        defaultFromId={accountId}
        onTransferred={() => void reload()}
      />
    </EntityDetailPage>
  );
}
