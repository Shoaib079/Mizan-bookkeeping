"use client";

/** Opening balances wizard — autosave drafts (DESIGN_SYSTEM §10, Slice 10.7). */

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ResumeDraftBanner } from "@/components/ui/resume-draft-banner";
import { DateInput } from "@/components/ui/date-input";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { Combobox } from "@/components/ui/combobox";
import { Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ValidationHint } from "@/components/ui/validation-hint";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useFormDraft } from "@/lib/form-draft";
import { useEntity } from "@/lib/entity-context";
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import {
  defaultMainDrawerId,
  loadBankAndCashAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { useToast } from "@/lib/toast";
import {
  formatTry,
  formatTrDate,
  parseTrDate,
  parseTryToKurus,
} from "@/lib/money";
import type {
  JournalLineOut,
  OpeningBalanceAccount,
  OpeningBalanceLineDraft,
  OpeningBalanceLineTarget,
  OpeningBalancePostResponse,
  OpeningBalanceValidateResponse,
} from "@/lib/settings-types";

type NamedRow = { id: string; name: string };

function newLine(): OpeningBalanceLineDraft {
  return {
    id: crypto.randomUUID(),
    target: "account",
    accountCode: "",
    side: "",
    moneyAccountId: "",
    supplierId: "",
    partnerId: "",
    customerId: "",
    amountTry: "",
  };
}

type OpeningBalancesDraft = {
  goLiveDate: string;
  lines: OpeningBalanceLineDraft[];
};

function isOpeningBalancesDraftEmpty(draft: OpeningBalancesDraft): boolean {
  if (draft.goLiveDate.trim()) return false;
  if (draft.lines.length !== 1) return false;
  const line = draft.lines[0];
  return (
    !line.amountTry.trim() &&
    !line.accountCode &&
    !line.moneyAccountId &&
    !line.supplierId &&
    !line.partnerId &&
    !line.customerId
  );
}

function lineToPayload(line: OpeningBalanceLineDraft) {
  const amount_kurus = parseTryToKurus(line.amountTry);
  if (amount_kurus === null || amount_kurus <= 0) {
    throw new Error("Each line needs a valid amount.");
  }
  switch (line.target) {
    case "account":
      if (!line.accountCode || !line.side) {
        throw new Error("Account lines need code and debit/credit side.");
      }
      return {
        account_code: line.accountCode,
        side: line.side,
        amount_kurus,
      };
    case "money_account":
      if (!line.moneyAccountId) throw new Error("Pick a bank or cash account.");
      return { money_account_id: line.moneyAccountId, amount_kurus };
    case "supplier":
      if (!line.supplierId) throw new Error("Pick a supplier.");
      return { supplier_id: line.supplierId, amount_kurus };
    case "partner":
      if (!line.partnerId) throw new Error("Pick a partner.");
      return { partner_id: line.partnerId, amount_kurus };
    case "customer":
      if (!line.customerId) throw new Error("Pick a customer.");
      return { customer_id: line.customerId, amount_kurus };
    default:
      throw new Error("Unknown line type.");
  }
}

function openingBalanceLineHint(line: OpeningBalanceLineDraft): string | null {
  if (!line.amountTry.trim()) {
    return "Enter an amount.";
  }
  const amountKurus = parseTryToKurus(line.amountTry);
  if (amountKurus === null || amountKurus <= 0) {
    return "Amount must be greater than zero.";
  }
  switch (line.target) {
    case "account":
      if (!line.accountCode) return "Pick an account.";
      if (!line.side) return "Pick debit or credit.";
      break;
    case "money_account":
      if (!line.moneyAccountId) return "Pick a bank or cash account.";
      break;
    case "supplier":
      if (!line.supplierId) return "Pick a supplier.";
      break;
    case "partner":
      if (!line.partnerId) return "Pick a partner.";
      break;
    case "customer":
      if (!line.customerId) return "Pick a customer.";
      break;
  }
  return null;
}

export default function OpeningBalancesPage() {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const [wizardSteps, setWizardSteps] = useState<string[]>([]);
  const [obAccounts, setObAccounts] = useState<OpeningBalanceAccount[]>([]);
  const [moneyAccounts, setMoneyAccounts] = useState<MoneyAccountOption[]>([]);
  const [suppliers, setSuppliers] = useState<NamedRow[]>([]);
  const [partners, setPartners] = useState<NamedRow[]>([]);
  const [customers, setCustomers] = useState<NamedRow[]>([]);
  const [goLiveDate, setGoLiveDate] = useState("");
  const [lines, setLines] = useState<OpeningBalanceLineDraft[]>([newLine()]);
  const [preview, setPreview] = useState<JournalLineOut[] | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [posted, setPosted] = useState<OpeningBalancePostResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [focusLineId, setFocusLineId] = useState<string | null>(null);
  const goLiveFocusedRef = useRef(false);

  const draftSnapshot = useMemo<OpeningBalancesDraft>(
    () => ({ goLiveDate, lines }),
    [goLiveDate, lines],
  );

  const {
    resumeDraft,
    acceptResume,
    declineResume,
    clearDraft,
  } = useFormDraft({
    entityId,
    formKey: "opening-balances",
    value: draftSnapshot,
    enabled: Boolean(entityId) && !posted,
    isEmpty: isOpeningBalancesDraftEmpty,
  });

  const lineHints = useMemo(
    () =>
      lines.map((line) => ({
        id: line.id,
        hint: openingBalanceLineHint(line),
      })),
    [lines],
  );
  const hasLineIssues = lineHints.some((row) => row.hint !== null);
  const debitTotal = useMemo(
    () =>
      lines.reduce((sum, line) => {
        if (line.target !== "account" || line.side !== "debit") return sum;
        const k = parseTryToKurus(line.amountTry);
        return k !== null && k > 0 ? sum + k : sum;
      }, 0),
    [lines],
  );
  const creditTotal = useMemo(
    () =>
      lines.reduce((sum, line) => {
        if (line.target !== "account" || line.side !== "credit") return sum;
        const k = parseTryToKurus(line.amountTry);
        return k !== null && k > 0 ? sum + k : sum;
      }, 0),
    [lines],
  );
  const hasAccountSides = lines.some(
    (line) => line.target === "account" && line.side,
  );
  const balanceMismatch =
    hasAccountSides && debitTotal > 0 && creditTotal > 0 && debitTotal !== creditTotal;
  const validateBlocked = hasLineIssues;

  const resetOpeningBalancesState = useCallback(() => {
    setWizardSteps([]);
    setObAccounts([]);
    setMoneyAccounts([]);
    setSuppliers([]);
    setPartners([]);
    setCustomers([]);
    setGoLiveDate("");
    setLines([newLine()]);
    setPreview(null);
    setPreviewMessage(null);
    setPosted(null);
    setError(null);
    setValidating(false);
    setPosting(false);
    setFocusLineId(null);
    goLiveFocusedRef.current = false;
  }, []);

  useEntitySwitchReset(entityId, resetOpeningBalancesState);

  const loadRefs = useCallback(async () => {
    if (!entityId) return;
    setError(null);
    try {
      const [obRes, money, supRes, partRes, custRes] = await Promise.all([
          apiFetch<OpeningBalanceAccount[]>(
            "/chart-of-accounts/default/opening-balance-accounts",
          ),
          loadBankAndCashAccounts(entityId),
          apiFetch<{ items: NamedRow[] }>(
            `/entities/${entityId}/suppliers?limit=100`,
          ),
          apiFetch<{ items: NamedRow[] }>(
            `/entities/${entityId}/partners?limit=100`,
          ),
          apiFetch<{ items: NamedRow[] }>(
            `/entities/${entityId}/customers?limit=100`,
          ),
        ]);
      setObAccounts(obRes);
      setMoneyAccounts(money);
      setSuppliers(supRes.items);
      setPartners(partRes.items);
      setCustomers(custRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load references");
    }
  }, [entityId]);

  useEffect(() => {
    void apiFetch<string[]>("/onboarding/wizard-steps")
      .then(setWizardSteps)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  function applyOpeningBalancesDraft(draft: OpeningBalancesDraft) {
    setGoLiveDate(draft.goLiveDate);
    setLines(draft.lines.length > 0 ? draft.lines : [newLine()]);
    setPreview(null);
    setPosted(null);
  }

  function handleResumeDraft() {
    const draft = acceptResume();
    if (!draft) return;
    applyOpeningBalancesDraft(draft);
  }

  function handleDeclineResume() {
    declineResume();
  }

  useEffect(() => {
    if (!entityId || goLiveFocusedRef.current) return;
    goLiveFocusedRef.current = true;
    window.setTimeout(() => document.getElementById("go-live")?.focus(), 0);
  }, [entityId]);

  useEffect(() => {
    if (!focusLineId) return;
    window.setTimeout(
      () => document.getElementById(`ob-amount-${focusLineId}`)?.focus(),
      0,
    );
    setFocusLineId(null);
  }, [focusLineId]);

  function updateLine(
    id: string,
    patch: Partial<OpeningBalanceLineDraft>,
  ) {
    setLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
    setPreview(null);
    setPosted(null);
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
    setPreview(null);
    setPosted(null);
  }

  async function onValidate(event?: FormEvent) {
    event?.preventDefault();
    if (!entityId) return;
    setValidating(true);
    setError(null);
    setPreview(null);
    setPosted(null);
    try {
      const payloadLines = lines.map(lineToPayload);
      const idempotencyKey = submitIdempotency.beginSubmit();
      const res = await apiFetch<OpeningBalanceValidateResponse>(
        `/onboarding/entities/${entityId}/opening-balances/validate`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: payloadLines }),
        },
      );
      submitIdempotency.completeSubmit();
      setPreview(res.journal_lines);
      setPreviewMessage(res.message);
      toast("Balances validated — review preview below");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  async function onPost() {
    if (!entityId || !preview) return;
    const iso = parseTrDate(goLiveDate);
    if (!iso) {
      setError("Enter go-live date as DD.MM.YYYY.");
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const payloadLines = lines.map(lineToPayload);
      const idempotencyKey = submitIdempotency.beginSubmit();
      const res = await apiFetch<OpeningBalancePostResponse>(
        `/onboarding/entities/${entityId}/opening-balances/post`,
        {
          method: "POST",
        idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            go_live_date: iso,
            actor_id: actorId,
            lines: payloadLines,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      setPosted(res);
      setPreview(res.journal_lines);
      clearDraft();
      toast("Opening balances posted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post failed");
    } finally {
      setPosting(false);
    }
  }

  function targetPicker(line: OpeningBalanceLineDraft) {
    switch (line.target) {
      case "account":
        return (
          <>
            <Combobox
              value={line.accountCode}
              onValueChange={(code) => {
                const acct = obAccounts.find((a) => a.code === code);
                updateLine(line.id, {
                  accountCode: code,
                  side: acct?.normal_balance ?? "",
                });
              }}
              className="min-w-[10rem]"
              options={[
                { value: "", label: "Account…" },
                ...obAccounts.map((a) => ({
                  value: a.code,
                  label: `${a.code} — ${a.name_en}`,
                })),
              ]}
              placeholder="Account…"
            />
            <Select
              value={line.side}
              onChange={(e) =>
                updateLine(line.id, {
                  side: e.target.value as "debit" | "credit",
                })
              }
              className="w-28"
            >
              <option value="">Side</option>
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
            </Select>
          </>
        );
      case "money_account":
        return (
          <Combobox
            value={line.moneyAccountId}
            onValueChange={(moneyAccountId) =>
              updateLine(line.id, { moneyAccountId })
            }
            className="min-w-[12rem]"
            options={[
              { value: "", label: "Bank / cash…" },
              ...moneyAccounts.map((a) => ({
                value: a.id,
                label: a.name,
              })),
            ]}
            placeholder="Bank / cash…"
          />
        );
      case "supplier":
        return (
          <Combobox
            value={line.supplierId}
            onValueChange={(supplierId) =>
              updateLine(line.id, { supplierId })
            }
            className="min-w-[12rem]"
            options={[
              { value: "", label: "Supplier…" },
              ...suppliers.map((s) => ({
                value: s.id,
                label: s.name,
              })),
            ]}
            placeholder="Supplier…"
          />
        );
      case "partner":
        return (
          <Combobox
            value={line.partnerId}
            onValueChange={(partnerId) => updateLine(line.id, { partnerId })}
            className="min-w-[12rem]"
            options={[
              { value: "", label: "Partner…" },
              ...partners.map((p) => ({
                value: p.id,
                label: p.name,
              })),
            ]}
            placeholder="Partner…"
          />
        );
      case "customer":
        return (
          <Combobox
            value={line.customerId}
            onValueChange={(customerId) =>
              updateLine(line.id, { customerId })
            }
            className="min-w-[12rem]"
            options={[
              { value: "", label: "Customer…" },
              ...customers.map((c) => ({
                value: c.id,
                label: c.name,
              })),
            ]}
            placeholder="Customer…"
          />
        );
      default:
        return null;
    }
  }

  return (
    <AppShell title="Opening balances">
      <p className="mb-4 text-sm text-muted-foreground">
        <Link href="/settings" className="text-primary hover:underline">
          ← Settings
        </Link>
      </p>

      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}

      {entityId && (
        <div className="max-w-4xl space-y-6">
          {wizardSteps.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Onboarding steps: {wizardSteps.join(" → ")}
            </p>
          )}

          {resumeDraft && (
            <ResumeDraftBanner
              onResume={handleResumeDraft}
              onDismiss={handleDeclineResume}
            />
          )}

          <form className="space-y-4" onSubmit={onValidate}>
            <div className="max-w-xs">
              <Label htmlFor="go-live">Go-live date</Label>
              <DateInput
                id="go-live"
                value={goLiveDate}
                onChange={setGoLiveDate}
              />
              {posted && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Posted for {formatTrDate(posted.go_live_date)}
                </p>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Balance lines</h2>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const line = newLine();
                    setLines((prev) => [...prev, line]);
                    setFocusLineId(line.id);
                  }}
                >
                  Add line
                </Button>
              </div>

              <div className="space-y-3">
                {lines.map((line) => {
                  const lineHint =
                    lineHints.find((row) => row.id === line.id)?.hint ?? null;
                  return (
                  <div
                    key={line.id}
                    className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <div>
                      <Label>Type</Label>
                      <Select
                        value={line.target}
                        onChange={(e) => {
                          const target =
                            e.target.value as OpeningBalanceLineTarget;
                          const patch: Partial<OpeningBalanceLineDraft> = {
                            target,
                            accountCode: "",
                            side: "",
                            moneyAccountId: "",
                            supplierId: "",
                            partnerId: "",
                            customerId: "",
                          };
                          if (target === "money_account") {
                            patch.moneyAccountId =
                              defaultMainDrawerId(moneyAccounts) ?? "";
                          }
                          updateLine(line.id, patch);
                        }}
                        className="w-36"
                      >
                        <option value="account">GL account</option>
                        <option value="money_account">Bank / cash</option>
                        <option value="supplier">Supplier</option>
                        <option value="partner">Partner</option>
                        <option value="customer">Customer</option>
                      </Select>
                    </div>
                    <div className="flex flex-wrap gap-2">{targetPicker(line)}</div>
                    <div>
                      <Label>Amount (₺)</Label>
                      <MoneyInput
                        id={`ob-amount-${line.id}`}
                        className="w-28"
                        value={line.amountTry}
                        onChange={(value) =>
                          updateLine(line.id, { amountTry: value })
                        }
                        placeholder="0,00"
                        showPreview={false}
                        showInvalidHint={false}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={lines.length <= 1}
                      onClick={() => removeLine(line.id)}
                    >
                      Remove
                    </Button>
                    {lineHint && (
                      <div className="w-full">
                        <ValidationHint>{lineHint}</ValidationHint>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>

            {balanceMismatch && (
              <ValidationHint variant="warning">
                GL debits ({formatTry(debitTotal)}) and credits ({formatTry(creditTotal)})
                do not match yet — validation may still balance other line types.
              </ValidationHint>
            )}
            {hasLineIssues && (
              <ValidationHint>
                Complete every line before validating — amount and account are required.
              </ValidationHint>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={validating || validateBlocked}
              >
                {validating ? "Validating…" : "Validate & preview journal"}
              </Button>
              {preview && !posted && (
                <Button
                  type="button"
                  disabled={posting || !goLiveDate}
                  onClick={() => void onPost()}
                >
                  {posting ? "Posting…" : "Post opening balances"}
                </Button>
              )}
            </div>
          </form>

          {previewMessage && !posted && (
            <p className="text-sm text-muted-foreground">{previewMessage}</p>
          )}

          {preview && preview.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">
                {posted ? "Posted journal" : "Journal preview"}
              </h2>
              <DataTable>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Account</DataTableHeaderCell>
                    <DataTableHeaderCell>Side</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <DataTableBody>
                  {preview.map((row, i) => (
                    <DataTableRow key={`${row.account_code}-${i}`}>
                      <DataTableCell>{row.account_code}</DataTableCell>
                      <DataTableCell className="capitalize">{row.side}</DataTableCell>
                      <DataTableCell align="right" className="tabular-nums">
                        {formatTry(row.amount_kurus)}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
              {posted && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Journal entry {posted.journal_entry_id} posted successfully.
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
