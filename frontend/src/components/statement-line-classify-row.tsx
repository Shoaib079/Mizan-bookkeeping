"use client";

/** One dense row in the bank statement classification table. */

import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { AddExpenseCategoryButton } from "@/components/forms/add-expense-category-button";
import { Combobox } from "@/components/ui/combobox";
import { DataTableCell } from "@/components/ui/data-table";
import { Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  BankStatementLine,
  StatementLineClassification,
} from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  classificationLabel,
  classificationOption,
  classificationOptionsForAmount,
  deliveryPlatformPickerHint,
  suggestClassificationForLine,
  suggestDeliveryPlatformId,
  suggestSupplierId,
  truncateStatementText,
} from "@/lib/statement-classification-options";
import { expenseAccountComboboxOptions } from "@/lib/expense-accounts";
import {
  deliveryPlatformComboboxOptions,
  type StatementClassificationPickers,
} from "@/lib/use-statement-classification-pickers";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

type Props = {
  statementId: string;
  line: BankStatementLine;
  pickers: StatementClassificationPickers;
  onClassified: () => void;
};

export function StatementLineClassifyRow({
  statementId,
  line,
  pickers,
  onClassified,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const resolved =
    line.status === "posted" ||
    line.status === "linked" ||
    line.status === "classified";

  const options = useMemo(
    () => classificationOptionsForAmount(line.amount_kurus),
    [line.amount_kurus],
  );

  const [classification, setClassification] = useState<StatementLineClassification>(
    () => suggestClassificationForLine(line),
  );
  const [supplierId, setSupplierId] = useState(pickers.suppliers[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(pickers.customers[0]?.id ?? "");
  const [counterpartId, setCounterpartId] = useState(
    pickers.moneyAccounts[0]?.id ?? "",
  );
  const [creditCardId, setCreditCardId] = useState(pickers.creditCards[0]?.id ?? "");
  const [expenseAccountId, setExpenseAccountId] = useState(
    pickers.expenseAccounts[0]?.id ?? "",
  );
  const [deliveryPlatformId, setDeliveryPlatformId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    submitIdempotency.resetSubmit();
  }, [line.id, submitIdempotency]);

  useEffect(() => {
    if (classification === "delivery_settlement" && !deliveryPlatformId) {
      const suggested = suggestDeliveryPlatformId(
        line.description,
        pickers.deliveryPlatforms,
      );
      if (suggested) setDeliveryPlatformId(suggested);
    }
    if (classification === "supplier_payment") {
      const suggested =
        line.suggestion?.supplier_id ??
        suggestSupplierId(line.description, pickers.suppliers);
      if (suggested) setSupplierId(suggested);
    }
  }, [
    classification,
    deliveryPlatformId,
    line.description,
    line.suggestion?.supplier_id,
    pickers.deliveryPlatforms,
    pickers.suppliers,
  ]);

  useEffect(() => {
    if (!options.some((opt) => opt.value === classification)) {
      setClassification(options[0]?.value ?? "unknown");
    }
  }, [options, classification]);

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
    if (classification === "rent_utility" || classification === "store_purchase")
      body.expense_account_id = expenseAccountId;
    if (classification === "delivery_settlement")
      body.delivery_platform_id = deliveryPlatformId;
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/banking/statements/${statementId}/lines/${line.id}/classify`,
        {
          method: "PATCH",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      submitIdempotency.completeSubmit();
      toast("Line classified");
      onClassified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classify failed");
    } finally {
      setSubmitting(false);
    }
  }

  const amountClass =
    line.amount_kurus > 0
      ? "text-success"
      : line.amount_kurus < 0
        ? "text-destructive"
        : "";

  const targetKind = classificationOption(classification)?.target;

  function targetControl() {
    if (resolved) return null;
    if (targetKind === "supplier") {
      return (
        <Combobox
          id={`sup-${line.id}`}
          value={supplierId}
          onValueChange={setSupplierId}
          options={pickers.suppliers.map((s) => ({
            value: s.id,
            label: s.name,
          }))}
          placeholder="Supplier…"
          className="h-8 min-w-[10rem] text-xs"
        />
      );
    }
    if (targetKind === "customer") {
      return (
        <Combobox
          id={`cust-${line.id}`}
          value={customerId}
          onValueChange={setCustomerId}
          options={pickers.customers.map((c) => ({
            value: c.id,
            label: c.name,
          }))}
          placeholder="Customer…"
          className="h-8 min-w-[10rem] text-xs"
        />
      );
    }
    if (targetKind === "transfer") {
      return (
        <Combobox
          id={`cp-${line.id}`}
          value={counterpartId}
          onValueChange={setCounterpartId}
          options={pickers.moneyAccounts.map((a) => ({
            value: a.id,
            label: a.name,
          }))}
          placeholder="Account…"
          className="h-8 min-w-[10rem] text-xs"
        />
      );
    }
    if (targetKind === "credit_card") {
      return (
        <Combobox
          id={`cc-${line.id}`}
          value={creditCardId}
          onValueChange={setCreditCardId}
          options={pickers.creditCards.map((a) => ({
            value: a.id,
            label: a.name,
          }))}
          placeholder="Card…"
          className="h-8 min-w-[10rem] text-xs"
        />
      );
    }
    if (targetKind === "expense") {
      return (
        <div className="flex min-w-0 items-end gap-1">
          <Combobox
            id={`exp-${line.id}`}
            value={expenseAccountId}
            onValueChange={setExpenseAccountId}
            options={expenseAccountComboboxOptions(pickers.expenseAccounts)}
            placeholder="Expense GL…"
            className="h-8 min-w-[10rem] flex-1 text-xs"
          />
          {entityId && (
            <AddExpenseCategoryButton
              entityId={entityId}
              className="shrink-0 px-1 text-[11px]"
              onCreated={async (account) => {
                pickers.appendExpenseAccount(account);
                setExpenseAccountId(account.id);
              }}
            />
          )}
        </div>
      );
    }
    if (targetKind === "delivery_platform") {
      const hint = deliveryPlatformPickerHint(
        line.description,
        pickers.deliveryPlatforms,
      );
      return (
        <div className="space-y-1">
          <Combobox
            id={`plat-${line.id}`}
            value={deliveryPlatformId}
            onValueChange={setDeliveryPlatformId}
            options={deliveryPlatformComboboxOptions(pickers.deliveryPlatforms)}
            placeholder="Platform…"
            emptyMessage={
              pickers.deliveryPlatformsError
                ? "Could not load platforms"
                : "No delivery platforms"
            }
            className="h-8 min-w-[10rem] text-xs"
          />
          {hint && <p className="text-[10px] text-warning">{hint}</p>}
        </div>
      );
    }
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  if (resolved) {
    return (
      <tr className="hover:bg-muted/20">
        <DataTableCell className="py-1.5 text-xs whitespace-nowrap">
          {formatTrDate(line.transaction_date)}
        </DataTableCell>
        <DataTableCell className="max-w-[7rem] py-1.5 text-xs text-muted-foreground">
          <span className="block truncate" title={line.reference ?? undefined}>
            {line.reference || "—"}
          </span>
        </DataTableCell>
        <DataTableCell className="max-w-[28rem] py-1.5 text-xs">
          <span className="block truncate" title={line.description}>
            {truncateStatementText(line.description, 96)}
          </span>
        </DataTableCell>
        <DataTableCell align="right" className={cn("py-1.5 text-xs font-medium", amountClass)}>
          {formatTry(line.amount_kurus)}
        </DataTableCell>
        <DataTableCell className="py-1.5 text-xs">
          {classificationLabel(line.classification)}
        </DataTableCell>
        <DataTableCell className="py-1.5 text-xs text-muted-foreground">—</DataTableCell>
        <DataTableCell className="py-1.5">
          <StatusBadge status={line.status} />
        </DataTableCell>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-muted/20 align-top">
      <DataTableCell className="py-1.5 text-xs whitespace-nowrap">
        {formatTrDate(line.transaction_date)}
      </DataTableCell>
      <DataTableCell className="max-w-[7rem] py-1.5 text-xs text-muted-foreground">
        <span className="block truncate" title={line.reference ?? undefined}>
          {line.reference || "—"}
        </span>
      </DataTableCell>
      <DataTableCell className="max-w-[28rem] py-1.5 text-xs">
        <span className="block truncate" title={line.description}>
          {truncateStatementText(line.description, 96)}
        </span>
        {line.status === "needs_review" && line.review_reason && (
          <span className="mt-0.5 block text-[11px] text-warning">
            {line.review_reason}
          </span>
        )}
      </DataTableCell>
      <DataTableCell align="right" className={cn("py-1.5 text-xs font-medium", amountClass)}>
        {formatTry(line.amount_kurus)}
      </DataTableCell>
      <DataTableCell className="py-1.5">
        <Select
          id={`cls-${line.id}`}
          className="h-8 min-w-[11rem] text-xs"
          value={classification}
          onChange={(e) =>
            setClassification(e.target.value as StatementLineClassification)
          }
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </DataTableCell>
      <DataTableCell className="py-1.5">{targetControl()}</DataTableCell>
      <DataTableCell className="py-1.5">
        <form onSubmit={onSubmit}>
          <Button
            type="submit"
            className="h-8 whitespace-nowrap px-3 text-xs"
            disabled={submitting}
          >
            {submitting ? "…" : "Classify"}
          </Button>
          {error && (
            <p className="mt-1 max-w-[12rem] text-[11px] text-destructive">
              {error}
            </p>
          )}
        </form>
      </DataTableCell>
    </tr>
  );
}
