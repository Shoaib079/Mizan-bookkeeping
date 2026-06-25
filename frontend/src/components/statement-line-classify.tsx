"use client";

/** Classify a bank statement line — Phase 9 Slice 4. */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type {
  BankStatementLine,
  StatementLineClassification,
} from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";

type MoneyAccount = { id: string; name: string; account_kind: string };
type Supplier = { id: string; name: string };
type Customer = { id: string; name: string };
type ChartAccount = { id: string; code: string; name_en: string };

const classificationOptions: {
  value: StatementLineClassification;
  label: string;
}[] = [
  { value: "supplier_payment", label: "Supplier payment" },
  { value: "transfer", label: "Transfer" },
  { value: "bank_fee", label: "Bank fee" },
  { value: "credit_card_payment", label: "Credit card payment" },
  { value: "customer_payment", label: "Customer payment" },
  { value: "rent_utility", label: "Rent / utility" },
  { value: "unknown", label: "Unknown (skip)" },
];

type Props = {
  statementId: string;
  line: BankStatementLine;
  onClassified: () => void;
};

export function StatementLineClassify({
  statementId,
  line,
  onClassified,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const [classification, setClassification] =
    useState<StatementLineClassification>("supplier_payment");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [moneyAccounts, setMoneyAccounts] = useState<MoneyAccount[]>([]);
  const [creditCards, setCreditCards] = useState<MoneyAccount[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<ChartAccount[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [counterpartId, setCounterpartId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resolved =
    line.status === "posted" ||
    line.status === "linked" ||
    line.status === "classified";

  const loadPickers = useCallback(async () => {
    if (!entityId) return;
    const [supRes, custRes, acctRes, ccRes, chartRes] = await Promise.all([
      apiFetch<{ items: Supplier[] }>(
        `/entities/${entityId}/suppliers?limit=100`,
      ),
      apiFetch<{ items: Customer[] }>(
        `/entities/${entityId}/customers?limit=100`,
      ),
      apiFetch<{ items: MoneyAccount[] }>(
        `/entities/${entityId}/banking/accounts?limit=100`,
      ),
      apiFetch<{ items: MoneyAccount[] }>(
        `/entities/${entityId}/banking/accounts?account_kind=credit_card&limit=50`,
      ),
      apiFetch<{ items: ChartAccount[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ),
    ]);
    setSuppliers(supRes.items);
    setCustomers(custRes.items);
    setMoneyAccounts(acctRes.items);
    setCreditCards(ccRes.items);
    const expenses = chartRes.items.filter((a) => a.code.startsWith("5"));
    setExpenseAccounts(expenses);
    if (supRes.items[0]) setSupplierId(supRes.items[0].id);
    if (custRes.items[0]) setCustomerId(custRes.items[0].id);
    if (acctRes.items[0]) setCounterpartId(acctRes.items[0].id);
    if (ccRes.items[0]) setCreditCardId(ccRes.items[0].id);
    if (expenses[0]) setExpenseAccountId(expenses[0].id);
  }, [entityId]);

  useEffect(() => {
    void loadPickers().catch(() => undefined);
  }, [loadPickers]);

  useEffect(() => {
    if (resolved) return;
    window.setTimeout(
      () => document.getElementById(`cls-${line.id}`)?.focus(),
      0,
    );
  }, [line.id, resolved]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || resolved) return;
    setSubmitting(true);
    setError(null);
    const body: Record<string, unknown> = {
      classification,
      actor_id: actorId,
    };
    if (classification === "supplier_payment") body.supplier_id = supplierId;
    if (classification === "transfer")
      body.counterpart_money_account_id = counterpartId;
    if (classification === "credit_card_payment")
      body.credit_card_money_account_id = creditCardId;
    if (classification === "customer_payment") body.customer_id = customerId;
    if (classification === "rent_utility")
      body.expense_account_id = expenseAccountId;
    try {
      await apiFetch(
        `/entities/${entityId}/banking/statements/${statementId}/lines/${line.id}/classify`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      toast("Line classified");
      onClassified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classify failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{line.description}</p>
          <p className="text-xs text-muted-foreground">
            {formatTrDate(line.transaction_date)}
            {line.reference && ` · ${line.reference}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="tabular-nums text-sm font-medium">
            {formatTry(line.amount_kurus)}
          </span>
          <StatusBadge status={line.status} />
        </div>
      </div>

      {line.status === "needs_review" && line.review_reason && (
        <p className="mb-3 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          {line.review_reason}
        </p>
      )}

      {resolved ? (
        <p className="text-sm text-muted-foreground">
          Classification: {line.classification.replace(/_/g, " ")}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor={`cls-${line.id}`}>Classification</Label>
            <Select
              id={`cls-${line.id}`}
              value={classification}
              onChange={(e) =>
                setClassification(
                  e.target.value as StatementLineClassification,
                )
              }
            >
              {classificationOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          {classification === "supplier_payment" && (
            <div>
              <Label htmlFor={`sup-${line.id}`}>Supplier</Label>
              <Select
                id={`sup-${line.id}`}
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {classification === "transfer" && (
            <div>
              <Label htmlFor={`cp-${line.id}`}>Counterpart account</Label>
              <Select
                id={`cp-${line.id}`}
                value={counterpartId}
                onChange={(e) => setCounterpartId(e.target.value)}
              >
                {moneyAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {classification === "credit_card_payment" && (
            <div>
              <Label htmlFor={`cc-${line.id}`}>Credit card</Label>
              <Select
                id={`cc-${line.id}`}
                value={creditCardId}
                onChange={(e) => setCreditCardId(e.target.value)}
              >
                {creditCards.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {classification === "customer_payment" && (
            <div>
              <Label htmlFor={`cust-${line.id}`}>Customer</Label>
              <Select
                id={`cust-${line.id}`}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {classification === "rent_utility" && (
            <div>
              <Label htmlFor={`exp-${line.id}`}>Expense account</Label>
              <Select
                id={`exp-${line.id}`}
                value={expenseAccountId}
                onChange={(e) => setExpenseAccountId(e.target.value)}
              >
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name_en}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Classifying…" : "Classify line"}
          </Button>
        </form>
      )}
    </div>
  );
}
