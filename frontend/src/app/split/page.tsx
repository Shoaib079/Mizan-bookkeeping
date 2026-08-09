"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page/page-header";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import {
  filterExpenseAccounts,
  formatExpenseAccountLabel,
  findExpenseAccountByCode,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { formatTrDate, formatTry, parseTryToKurus } from "@/lib/money";

type ExpenseCandidate = {
  expense_id: string;
  expense_date: string;
  description: string;
  amount_kurus: number;
  remaining_splittable_kurus: number;
};

type PaymentCandidate = {
  supplier_ledger_entry_id: string;
  supplier_name: string;
  payment_date: string;
  description: string;
  amount_kurus: number;
  remaining_splittable_kurus: number;
};

type PartnerRow = { id: string; name: string; is_active: boolean };

type SourceTab = "bank_expense" | "supplier_payment";

type Selected =
  | { kind: "bank_expense"; id: string }
  | { kind: "supplier_payment"; id: string }
  | null;

export default function SplitHubPage() {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const [tab, setTab] = useState<SourceTab>("bank_expense");
  const [expenses, setExpenses] = useState<ExpenseCandidate[]>([]);
  const [payments, setPayments] = useState<PaymentCandidate[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<ChartAccount[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Selected>(null);
  const [partnerId, setPartnerId] = useState("");
  const [personalText, setPersonalText] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const closeDialog = useCallback(() => {
    setSelected(null);
    setPartnerId("");
    setPersonalText("");
    setNote("");
    setFormError(null);
  }, []);

  const reload = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const q = search.trim()
        ? `&q=${encodeURIComponent(search.trim())}`
        : "";
      const [expenseList, paymentList, partnerList, chart] = await Promise.all([
        apiFetch<{ items: ExpenseCandidate[] }>(
          `/entities/${entityId}/splits/bank-expenses?limit=50${q}`,
        ),
        apiFetch<{ items: PaymentCandidate[] }>(
          `/entities/${entityId}/splits/supplier-payments?limit=50${q}`,
        ),
        apiFetch<{ items: PartnerRow[] }>(
          `/entities/${entityId}/partners?limit=200`,
        ),
        apiFetch<{ items: ChartAccount[] }>(
          `/entities/${entityId}/chart-of-accounts?limit=200`,
        ),
      ]);
      setExpenses(expenseList.items);
      setPayments(paymentList.items);
      setPartners(partnerList.items.filter((p) => p.is_active !== false));
      const filtered = filterExpenseAccounts(chart.items);
      setExpenseAccounts(filtered);
      const general = findExpenseAccountByCode(chart.items, "5200");
      if (general) setExpenseAccountId(general.id);
      else if (filtered[0]) setExpenseAccountId(filtered[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, search]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectedExpense = useMemo(() => {
    if (!selected || selected.kind !== "bank_expense") return null;
    return expenses.find((row) => row.expense_id === selected.id) ?? null;
  }, [expenses, selected]);

  const selectedPayment = useMemo(() => {
    if (!selected || selected.kind !== "supplier_payment") return null;
    return (
      payments.find((row) => row.supplier_ledger_entry_id === selected.id) ??
      null
    );
  }, [payments, selected]);

  useEffect(() => {
    if (selected?.kind === "bank_expense" && !selectedExpense) closeDialog();
    if (selected?.kind === "supplier_payment" && !selectedPayment) closeDialog();
  }, [selected, selectedExpense, selectedPayment, closeDialog]);

  const remaining =
    selectedExpense?.remaining_splittable_kurus ??
    selectedPayment?.remaining_splittable_kurus ??
    null;
  const personalKurus = parseTryToKurus(personalText || "0");
  const restaurantKurus =
    remaining != null && personalKurus !== null
      ? remaining - personalKurus
      : null;

  function openExpense(id: string) {
    setSelected({ kind: "bank_expense", id });
    setPartnerId("");
    setPersonalText("");
    setNote("");
    setFormError(null);
    submitIdempotency.resetSubmit();
  }

  function openPayment(id: string) {
    setSelected({ kind: "supplier_payment", id });
    setPartnerId("");
    setPersonalText("");
    setNote("");
    setFormError(null);
    submitIdempotency.resetSubmit();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !selected) {
      setFormError("Pick something to split.");
      return;
    }
    if (!partnerId) {
      setFormError("Select a partner.");
      return;
    }
    if (personalKurus === null || personalKurus <= 0) {
      setFormError("Enter a personal amount greater than zero.");
      return;
    }
    if (remaining == null || personalKurus > remaining) {
      setFormError("Personal amount cannot exceed the remaining total.");
      return;
    }
    if (!note.trim()) {
      setFormError("Note is required.");
      return;
    }
    if (selected.kind === "supplier_payment" && !expenseAccountId) {
      setFormError("Select an expense account to reverse the personal share.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      if (selected.kind === "bank_expense") {
        await apiFetch(`/entities/${entityId}/splits/bank-expenses`, {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expense_id: selected.id,
            partner_id: partnerId,
            personal_amount_kurus: personalKurus,
            note: note.trim(),
            actor_id: actorId,
          }),
        });
      } else {
        await apiFetch(`/entities/${entityId}/splits/supplier-payments`, {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplier_ledger_entry_id: selected.id,
            partner_id: partnerId,
            personal_amount_kurus: personalKurus,
            expense_account_id: expenseAccountId,
            note: note.trim(),
            actor_id: actorId,
          }),
        });
      }
      submitIdempotency.completeSubmit();
      toast("Split recorded");
      closeDialog();
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!entityId) {
    return (
      <AppShell title="Split">
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      </AppShell>
    );
  }

  const dialogTitle =
    selected?.kind === "supplier_payment"
      ? "Split supplier payment"
      : "Split bank expense";

  return (
    <AppShell title="Split">
      <PageHeader
        title="Split"
        meta={
          <>
            Peel a personal share onto a partner from a posted bank expense
            (SGK, rent…) or a supplier payment. Restaurant share stays on the
            books; bank is unchanged. Partner paid from pocket with no bank
            payment yet?{" "}
            <Link href="/partners" className="underline underline-offset-2">
              Partners → Split buy
            </Link>
            .
          </>
        }
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          type="button"
          className={tab === "bank_expense" ? undefined : "opacity-60"}
          onClick={() => setTab("bank_expense")}
        >
          Bank expenses
        </Button>
        <Button
          type="button"
          className={tab === "supplier_payment" ? undefined : "opacity-60"}
          onClick={() => setTab("supplier_payment")}
        >
          Supplier payments
        </Button>
      </div>

      <div className="mb-4 max-w-md">
        <Label htmlFor="split-search">Search</Label>
        <Input
          id="split-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            tab === "supplier_payment" ? "Metro, payment…" : "SGK, rent…"
          }
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : tab === "bank_expense" ? (
        expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No bank expenses left to split. Classify outflows as Expense from
            bank first.
          </p>
        ) : (
          <div className="mb-8 overflow-x-auto">
            <DataTable wide>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Date</DataTableHeaderCell>
                  <DataTableHeaderCell>Description</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Total</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Left</DataTableHeaderCell>
                  <DataTableHeaderCell> </DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {expenses.map((row) => (
                  <DataTableRow key={row.expense_id}>
                    <DataTableCell>
                      {formatTrDate(row.expense_date)}
                    </DataTableCell>
                    <DataTableCell>{row.description}</DataTableCell>
                    <DataTableCell align="right">
                      {formatTry(row.amount_kurus)}
                    </DataTableCell>
                    <DataTableCell align="right">
                      {formatTry(row.remaining_splittable_kurus)}
                    </DataTableCell>
                    <DataTableCell>
                      <Button
                        type="button"
                        className="h-8"
                        onClick={() => openExpense(row.expense_id)}
                      >
                        Select
                      </Button>
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </div>
        )
      ) : payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No supplier payments left to split. Pay a supplier from the bank
          statement (or cash) first.
        </p>
      ) : (
        <div className="mb-8 overflow-x-auto">
          <DataTable wide>
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Date</DataTableHeaderCell>
                <DataTableHeaderCell>Supplier</DataTableHeaderCell>
                <DataTableHeaderCell>Description</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Total</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Left</DataTableHeaderCell>
                <DataTableHeaderCell> </DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {payments.map((row) => (
                <DataTableRow key={row.supplier_ledger_entry_id}>
                  <DataTableCell>
                    {formatTrDate(row.payment_date)}
                  </DataTableCell>
                  <DataTableCell>{row.supplier_name}</DataTableCell>
                  <DataTableCell>{row.description}</DataTableCell>
                  <DataTableCell align="right">
                    {formatTry(row.amount_kurus)}
                  </DataTableCell>
                  <DataTableCell align="right">
                    {formatTry(row.remaining_splittable_kurus)}
                  </DataTableCell>
                  <DataTableCell>
                    <Button
                      type="button"
                      className="h-8"
                      onClick={() =>
                        openPayment(row.supplier_ledger_entry_id)
                      }
                    >
                      Select
                    </Button>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        </div>
      )}

      <FormDialogShell
        open={selected !== null}
        title={dialogTitle}
        onClose={closeDialog}
      >
        {(selectedExpense || selectedPayment) && (
          <form onSubmit={onSubmit} className="space-y-3">
            {selectedPayment && (
              <p className="text-sm font-medium">{selectedPayment.supplier_name}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {selectedExpense?.description ?? selectedPayment?.description}
            </p>
            <p className="text-sm tabular-nums">
              Remaining: {remaining != null ? formatTry(remaining) : "—"}
            </p>
            <div>
              <Label htmlFor="split-partner">Partner</Label>
              <Combobox
                id="split-partner"
                value={partnerId}
                onValueChange={setPartnerId}
                options={partners.map((p) => ({
                  value: p.id,
                  label: p.name,
                }))}
                placeholder="Partner…"
                required
              />
            </div>
            <div>
              <Label htmlFor="split-personal">Personal amount (TRY)</Label>
              <MoneyInput
                id="split-personal"
                value={personalText}
                onChange={setPersonalText}
                required
              />
            </div>
            <div>
              <Label>Restaurant amount (auto)</Label>
              <p className="mt-1 text-sm tabular-nums">
                {restaurantKurus == null
                  ? "—"
                  : restaurantKurus < 0
                    ? "Personal exceeds remaining"
                    : formatTry(restaurantKurus)}
              </p>
            </div>
            {selected?.kind === "supplier_payment" && (
              <div>
                <Label htmlFor="split-expense-account">
                  Expense account (personal reverse)
                </Label>
                <Combobox
                  id="split-expense-account"
                  value={expenseAccountId}
                  onValueChange={setExpenseAccountId}
                  options={expenseAccounts.map((a) => ({
                    value: a.id,
                    label: formatExpenseAccountLabel(a),
                  }))}
                  placeholder="Expense account…"
                  required
                />
              </div>
            )}
            <div>
              <Label htmlFor="split-note">Note</Label>
              <Input
                id="split-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required
                maxLength={512}
              />
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Recording…" : "Record split"}
            </Button>
          </form>
        )}
      </FormDialogShell>
    </AppShell>
  );
}
