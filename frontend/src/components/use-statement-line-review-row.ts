"use client";

/** State + load/classify/correct for StatementLineReviewRow (file-size split). */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import type {
  StatementLineClassification,
  StatementLineReview,
} from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import {
  filterExpenseAccounts,
  filterRevenueAccounts,
  mergeExpenseAccounts,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { suggestSupplierId } from "@/lib/statement-classification-options";
import {
  classifyStatementLine,
  correctStatementLine,
  createSupplierFromStatementLine,
} from "@/lib/statement-review-actions";
import { isLineCorrectable } from "@/lib/statement-review";
import { useHydrateOnce } from "@/lib/use-hydrate-once";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

type MoneyAccount = { id: string; name: string; account_kind: string };
type Supplier = { id: string; name: string };
type Customer = { id: string; name: string };

export type UseStatementLineReviewRowArgs = {
  line: StatementLineReview;
  onUpdated: () => void;
};

export function useStatementLineReviewRow({
  line,
  onUpdated,
}: UseStatementLineReviewRowArgs) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const [expanded, setExpanded] = useState(
    line.status === "needs_review" || line.status === "imported",
  );
  const [classification, setClassification] =
    useState<StatementLineClassification>(
      line.suggestion?.classification ??
        line.classification ??
        "supplier_payment",
    );
  const [learnAs, setLearnAs] = useState(line.description);
  const [supplierName, setSupplierName] = useState(
    line.description.slice(0, 512),
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [moneyAccounts, setMoneyAccounts] = useState<MoneyAccount[]>([]);
  const [creditCards, setCreditCards] = useState<MoneyAccount[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<ChartAccount[]>([]);
  const [incomeAccounts, setIncomeAccounts] = useState<ChartAccount[]>([]);
  const [supplierId, setSupplierId] = useState(
    line.supplier_id ?? line.suggestion?.supplier_id ?? "",
  );
  const [customerId, setCustomerId] = useState("");
  const [counterpartId, setCounterpartId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  // Deliberately no first-in-list default (that would be Sales Revenue).
  const [incomeAccountId, setIncomeAccountId] = useState("");
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
    const expenses = filterExpenseAccounts(chartRes.items);
    setExpenseAccounts(expenses);
    setIncomeAccounts(filterRevenueAccounts(chartRes.items));
    // `prev ||` so a default never replaces a choice; reading through the
    // updater is what takes `supplierId` out of the deps below, which is what
    // made picking a supplier re-run this and re-seed the expense account.
    const sugSupplier =
      line.suggestion?.supplier_id ??
      suggestSupplierId(line.description, supRes.items);
    const sugExpense = line.suggestion?.expense_account_id;
    setSupplierId((prev) => prev || sugSupplier || supRes.items[0]?.id || "");
    setCustomerId((prev) => prev || custRes.items[0]?.id || "");
    setCounterpartId((prev) => prev || acctRes.items[0]?.id || "");
    setCreditCardId((prev) => prev || ccRes.items[0]?.id || "");
    setExpenseAccountId((prev) => prev || sugExpense || expenses[0]?.id || "");
  }, [
    entityId,
    line.description,
    line.suggestion?.supplier_id,
    line.suggestion?.expense_account_id,
  ]);

  useEffect(() => {
    if (!expanded) return;
    void loadPickers().catch(() => undefined);
  }, [expanded, loadPickers]);

  useEffect(() => {
    submitIdempotency.resetSubmit();
  }, [line.id, submitIdempotency]);

  // `line.suggestion` is an object; a refresh used to put it back over a choice.
  useHydrateOnce(line.id, true, () => {
    if (line.suggestion) {
      setClassification(line.suggestion.classification);
      if (line.suggestion.supplier_id) setSupplierId(line.suggestion.supplier_id);
      if (line.suggestion.expense_account_id) {
        setExpenseAccountId(line.suggestion.expense_account_id);
      }
    }
    setLearnAs(line.description);
  });

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
    if (targetClassification === "transfer") {
      body.counterpart_money_account_id = counterpartId;
    }
    if (targetClassification === "credit_card_payment") {
      body.credit_card_money_account_id = creditCardId;
    }
    if (targetClassification === "customer_payment") body.customer_id = customerId;
    if (
      targetClassification === "rent_utility" ||
      targetClassification === "store_purchase"
    ) {
      body.expense_account_id = expenseAccountId;
    }
    if (targetClassification === "other_income") {
      body.income_account_id = incomeAccountId;
    }
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

  function openCorrectDialog() {
    setCorrectClassification(
      line.classification === "unclassified" ? "unknown" : line.classification,
    );
    setCorrectOpen(true);
  }

  function onExpenseAccountCreated(account: ChartAccount) {
    setExpenseAccounts((prev) => mergeExpenseAccounts(prev, account));
    setExpenseAccountId(account.id);
  }

  return {
    entityId,
    expanded,
    setExpanded,
    classification,
    setClassification,
    learnAs,
    setLearnAs,
    supplierName,
    setSupplierName,
    suppliers,
    customers,
    moneyAccounts,
    creditCards,
    expenseAccounts,
    incomeAccounts,
    supplierId,
    setSupplierId,
    customerId,
    setCustomerId,
    counterpartId,
    setCounterpartId,
    creditCardId,
    setCreditCardId,
    expenseAccountId,
    setExpenseAccountId,
    incomeAccountId,
    setIncomeAccountId,
    error,
    submitting,
    correctOpen,
    setCorrectOpen,
    correctReason,
    setCorrectReason,
    correctClassification,
    setCorrectClassification,
    correctable,
    isRuleAuto,
    canAct,
    handleConfirm,
    handleClassify,
    handleCreateSupplier,
    handleCorrect,
    openCorrectDialog,
    onExpenseAccountCreated,
  };
}
