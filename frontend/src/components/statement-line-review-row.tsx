"use client";

/** Inline statement line review — confirm, correct, create supplier (unified hub). */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { AddExpenseCategoryButton } from "@/components/forms/add-expense-category-button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  StatementLineClassification,
  StatementLineReview,
} from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import {
  expenseAccountComboboxOptions,
  filterExpenseAccounts,
  mergeExpenseAccounts,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  classifyStatementLine,
  correctStatementLine,
  createSupplierFromStatementLine,
} from "@/lib/statement-review-actions";
import {
  isLineCorrectable,
} from "@/lib/statement-review";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { apiFetch } from "@/lib/api";

type MoneyAccount = { id: string; name: string; account_kind: string };
type Supplier = { id: string; name: string };
type Customer = { id: string; name: string };

import {
  classificationLabel,
  classificationOptionsForAmount,
  STATEMENT_CLASSIFICATION_OPTIONS,
  suggestClassificationForLine,
  suggestSupplierId,
} from "@/lib/statement-classification-options";

type Props = {
  line: StatementLineReview;
  onUpdated: () => void;
  bulkChecked?: boolean;
  bulkSelectable?: boolean;
  onToggleBulkChecked?: (checked: boolean) => void;
};

export function StatementLineReviewRow({
  line,
  onUpdated,
  bulkChecked = false,
  bulkSelectable = false,
  onToggleBulkChecked,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const [expanded, setExpanded] = useState(
    line.status === "needs_review" || line.status === "imported",
  );
  const [classification, setClassification] = useState<StatementLineClassification>(
    line.suggestion?.classification ?? line.classification ?? "supplier_payment",
  );
  const [learnAs, setLearnAs] = useState(line.description);
  const [supplierName, setSupplierName] = useState(line.description.slice(0, 512));
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [moneyAccounts, setMoneyAccounts] = useState<MoneyAccount[]>([]);
  const [creditCards, setCreditCards] = useState<MoneyAccount[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<ChartAccount[]>([]);
  const [supplierId, setSupplierId] = useState(line.supplier_id ?? line.suggestion?.supplier_id ?? "");
  const [customerId, setCustomerId] = useState("");
  const [counterpartId, setCounterpartId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [correctReason, setCorrectReason] = useState("");
  const [correctClassification, setCorrectClassification] =
    useState<StatementLineClassification>("unknown");

  const correctable = isLineCorrectable(line);
  const isRuleAuto = line.classification_source === "rule_auto";
  const canAct =
    line.status === "needs_review" ||
    line.status === "imported" ||
    correctable;

  const loadPickers = useCallback(async () => {
    if (!entityId) return;
    const [supRes, custRes, acctRes, ccRes, chartRes] = await Promise.all([
      apiFetch<{ items: Supplier[] }>(`/entities/${entityId}/suppliers?limit=100`),
      apiFetch<{ items: Customer[] }>(`/entities/${entityId}/customers?limit=100`),
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
    const expenses = filterExpenseAccounts(chartRes.items);
    setExpenseAccounts(expenses);
    if (!supplierId && supRes.items[0]) setSupplierId(supRes.items[0].id);
    const suggested =
      line.suggestion?.supplier_id ??
      suggestSupplierId(line.description, supRes.items);
    if (suggested) setSupplierId(suggested);
    if (custRes.items[0]) setCustomerId(custRes.items[0].id);
    if (acctRes.items[0]) setCounterpartId(acctRes.items[0].id);
    if (ccRes.items[0]) setCreditCardId(ccRes.items[0].id);
    if (expenses[0] && !line.suggestion?.expense_account_id) {
      setExpenseAccountId(expenses[0].id);
    }
    if (line.suggestion?.expense_account_id) {
      setExpenseAccountId(line.suggestion.expense_account_id);
    }
  }, [entityId, line.description, line.suggestion?.supplier_id, line.suggestion?.expense_account_id, supplierId]);

  useEffect(() => {
    if (!expanded) return;
    void loadPickers().catch(() => undefined);
  }, [expanded, loadPickers]);

  useEffect(() => {
    submitIdempotency.resetSubmit();
  }, [line.id, submitIdempotency]);

  useEffect(() => {
    if (line.suggestion) {
      setClassification(line.suggestion.classification);
      if (line.suggestion.supplier_id) setSupplierId(line.suggestion.supplier_id);
      if (line.suggestion.expense_account_id) {
        setExpenseAccountId(line.suggestion.expense_account_id);
      }
    }
    setLearnAs(line.description);
  }, [line.id, line.suggestion, line.description]);

  function learnMatchTokenPayload(): string | undefined {
    const trimmed = learnAs.trim();
    if (!trimmed || trimmed === line.description.trim()) {
      return undefined;
    }
    return trimmed;
  }

  function buildClassifyBody(
    targetClassification: StatementLineClassification,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      classification: targetClassification,
      actor_id: actorId,
    };
    const token = learnMatchTokenPayload();
    if (token) body.match_token = token;
    if (targetClassification === "supplier_payment") body.supplier_id = supplierId;
    if (targetClassification === "transfer")
      body.counterpart_money_account_id = counterpartId;
    if (targetClassification === "credit_card_payment")
      body.credit_card_money_account_id = creditCardId;
    if (targetClassification === "customer_payment") body.customer_id = customerId;
    if (targetClassification === "rent_utility" || targetClassification === "store_purchase")
      body.expense_account_id = expenseAccountId;
    return body;
  }

  async function handleConfirm() {
    if (!entityId) return;
    setSubmitting(true);
    setError(null);
    const target = line.suggestion?.classification ?? classification;
    const body = buildClassifyBody(target);
    if (target === "supplier_payment" && line.suggestion?.supplier_id) {
      body.supplier_id = line.suggestion.supplier_id;
    }
    if (
      (target === "store_purchase" || target === "rent_utility") &&
      line.suggestion?.expense_account_id
    ) {
      body.expense_account_id = line.suggestion.expense_account_id;
    }
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await classifyStatementLine(
        entityId,
        line.statement_id,
        line.id,
        body as Parameters<typeof classifyStatementLine>[3],
        idempotencyKey,
      );
      submitIdempotency.completeSubmit();
      toast("Line classified");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classify failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClassify(event: FormEvent) {
    event.preventDefault();
    if (!entityId) return;
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await classifyStatementLine(
        entityId,
        line.statement_id,
        line.id,
        buildClassifyBody(classification) as Parameters<
          typeof classifyStatementLine
        >[3],
        idempotencyKey,
      );
      submitIdempotency.completeSubmit();
      toast("Line classified");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classify failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateSupplier() {
    if (!entityId) return;
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const result = await createSupplierFromStatementLine(
        entityId,
        line.statement_id,
        line.id,
        {
          name: supplierName.trim() || undefined,
          match_token: learnMatchTokenPayload(),
        },
        idempotencyKey,
      );
      submitIdempotency.completeSubmit();
      setSupplierId(result.supplier_id);
      toast(`Supplier “${result.supplier_name}” created and linked`);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create supplier failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCorrect(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !correctReason.trim()) {
      setError("Correction reason is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await correctStatementLine(
        entityId,
        line.statement_id,
        line.id,
        {
          ...(buildClassifyBody(correctClassification) as Parameters<
            typeof correctStatementLine
          >[3]),
          reason: correctReason.trim(),
        },
        idempotencyKey,
      );
      submitIdempotency.completeSubmit();
      toast("Line corrected");
      setCorrectOpen(false);
      setCorrectReason("");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`rounded-lg border bg-card p-4 ${
        isRuleAuto ? "border-primary/40 ring-1 ring-primary/20" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{line.description}</p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border-border"
              checked={bulkChecked}
              disabled={!bulkSelectable}
              aria-label={`Select ${line.description}`}
              onChange={(e) => onToggleBulkChecked?.(e.target.checked)}
            />
            <span>
              {formatTrDate(line.transaction_date)}
              {line.reference && ` · ${line.reference}`}
              {line.original_filename && ` · ${line.original_filename}`}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {classificationLabel(line.classification)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="tabular-nums text-sm font-medium">
            {formatTry(line.amount_kurus)}
          </span>
          <StatusBadge status={line.status} />
          {isRuleAuto && (
            <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Auto rule
            </span>
          )}
          {canAct && (
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Collapse" : "Actions"}
            </Button>
          )}
        </div>
      </div>

      {line.status === "needs_review" && line.review_reason && (
        <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          {line.review_reason}
        </p>
      )}

      {line.suggestion && (
        <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <p className="font-medium">Suggestion</p>
          <p className="text-muted-foreground">
            {classificationLabel(line.suggestion.classification)}
            {line.suggestion.supplier_id && " · supplier linked in rule"}
            {" · "}
            <span className="capitalize">{line.suggestion.confidence}</span> confidence
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{line.suggestion.reason}</p>
        </div>
      )}

      {expanded && canAct && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div>
            <Label htmlFor={`learn-as-${line.id}`}>Learn as</Label>
            <Input
              id={`learn-as-${line.id}`}
              value={learnAs}
              onChange={(event) => setLearnAs(event.target.value)}
              placeholder={line.description}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Shorten to the counterparty (e.g. MIGROS) so the rule matches varied
              descriptions. Leave as-is to learn the full description.
            </p>
          </div>

          {(line.status === "needs_review" || line.status === "imported") && (
            <>
              {line.suggestion && (
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleConfirm()}
                >
                  {submitting ? "Confirming…" : "Confirm suggestion"}
                </Button>
              )}

              <form onSubmit={handleClassify} className="space-y-3">
                <div>
                  <Label htmlFor={`cls-${line.id}`}>Classification</Label>
                  <Select
                    id={`cls-${line.id}`}
                    value={classification}
                    onChange={(event) =>
                      setClassification(
                        event.target.value as StatementLineClassification,
                      )
                    }
                  >
                    {classificationOptionsForAmount(line.amount_kurus).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>

                {classification === "supplier_payment" && (
                  <div>
                    <Label htmlFor={`sup-${line.id}`}>Supplier</Label>
                    <Combobox
                      id={`sup-${line.id}`}
                      value={supplierId}
                      onValueChange={setSupplierId}
                      options={suppliers.map((supplier) => ({
                        value: supplier.id,
                        label: supplier.name,
                      }))}
                      placeholder="Supplier…"
                    />
                  </div>
                )}

                {classification === "transfer" && (
                  <div>
                    <Label htmlFor={`cp-${line.id}`}>Counterpart account</Label>
                    <Combobox
                      id={`cp-${line.id}`}
                      value={counterpartId}
                      onValueChange={setCounterpartId}
                      options={moneyAccounts.map((account) => ({
                        value: account.id,
                        label: account.name,
                      }))}
                      placeholder="Counterpart account…"
                    />
                  </div>
                )}

                {classification === "credit_card_payment" && (
                  <div>
                    <Label htmlFor={`cc-${line.id}`}>Credit card</Label>
                    <Combobox
                      id={`cc-${line.id}`}
                      value={creditCardId}
                      onValueChange={setCreditCardId}
                      options={creditCards.map((account) => ({
                        value: account.id,
                        label: account.name,
                      }))}
                      placeholder="Credit card…"
                    />
                  </div>
                )}

                {classification === "customer_payment" && (
                  <div>
                    <Label htmlFor={`cust-${line.id}`}>Customer</Label>
                    <Combobox
                      id={`cust-${line.id}`}
                      value={customerId}
                      onValueChange={setCustomerId}
                      options={customers.map((customer) => ({
                        value: customer.id,
                        label: customer.name,
                      }))}
                      placeholder="Customer…"
                    />
                  </div>
                )}

                {classification === "rent_utility" || classification === "store_purchase" ? (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`exp-${line.id}`}>Expense account</Label>
                      {entityId && (
                        <AddExpenseCategoryButton
                          entityId={entityId}
                          onCreated={async (account) => {
                            setExpenseAccounts((prev) =>
                              mergeExpenseAccounts(prev, account),
                            );
                            setExpenseAccountId(account.id);
                          }}
                        />
                      )}
                    </div>
                    <Combobox
                      id={`exp-${line.id}`}
                      value={expenseAccountId}
                      onValueChange={setExpenseAccountId}
                      options={expenseAccountComboboxOptions(expenseAccounts)}
                      placeholder="Expense account…"
                    />
                  </div>
                ) : null}

                <Button type="submit" variant="secondary" disabled={submitting}>
                  {submitting ? "Posting…" : "Classify & post"}
                </Button>
              </form>

              <div className="space-y-3 rounded-md border border-dashed border-border p-3">
                <p className="text-sm font-medium">Create supplier from this line</p>
                <div>
                  <Label htmlFor={`sup-name-${line.id}`}>Supplier name</Label>
                  <Input
                    id={`sup-name-${line.id}`}
                    value={supplierName}
                    onChange={(event) => setSupplierName(event.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={submitting}
                  onClick={() => void handleCreateSupplier()}
                >
                  {submitting ? "Creating…" : "Create supplier & learn"}
                </Button>
              </div>
            </>
          )}

          {correctable && (
            <Button
              type="button"
              variant={isRuleAuto ? "primary" : "secondary"}
              disabled={submitting}
              onClick={() => {
                setCorrectClassification(
                  line.classification === "unclassified"
                    ? "unknown"
                    : line.classification,
                );
                setCorrectOpen(true);
              }}
            >
              Void / reverse & re-classify
            </Button>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      <Dialog
        open={correctOpen}
        title="Correct statement line"
        onClose={() => setCorrectOpen(false)}
      >
        <form onSubmit={handleCorrect} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Voids the linked journal entry through the ledger void path, downgrades
            the learned rule, and posts the corrected classification.
          </p>
          <div>
            <Label htmlFor={`reason-${line.id}`}>Reason (required)</Label>
            <Input
              id={`reason-${line.id}`}
              value={correctReason}
              onChange={(event) => setCorrectReason(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor={`correct-cls-${line.id}`}>New classification</Label>
            <Select
              id={`correct-cls-${line.id}`}
              value={correctClassification}
              onChange={(event) =>
                setCorrectClassification(
                  event.target.value as StatementLineClassification,
                )
              }
            >
              {STATEMENT_CLASSIFICATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          {correctClassification === "supplier_payment" && (
            <div>
              <Label htmlFor={`correct-sup-${line.id}`}>Supplier</Label>
              <Combobox
                id={`correct-sup-${line.id}`}
                value={supplierId}
                onValueChange={setSupplierId}
                options={suppliers.map((supplier) => ({
                  value: supplier.id,
                  label: supplier.name,
                }))}
                placeholder="Supplier…"
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCorrectOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !correctReason.trim()}>
              {submitting ? "Correcting…" : "Correct & re-post"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
