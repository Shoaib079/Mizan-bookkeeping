"use client";

/** Write a journal entry by hand — DESIGN_ARCHETYPES §7 (`FormPage`).
 *
 * The escape hatch. Everything else in Mizan posts through a flow that knows
 * which accounts to touch; this one knows nothing, so it enforces what it can:
 * two lines minimum, debits equal to credits, every line complete, and a
 * description, because a manual entry with no reason attached is the one thing
 * an auditor will always ask about.
 *
 * Problems are listed rather than hidden behind a disabled button — a Save you
 * cannot press and cannot explain is the worst version of this screen.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { FormPage, FormSection } from "@/components/page/form-page";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { formatChartAccountLabel } from "@/lib/chart-accounts";
import { useEntity } from "@/lib/entity-context";
import { isoToday } from "@/lib/date-range";
import { formatTry } from "@/lib/money";
import {
  CASH_FLOW_CATEGORIES,
  DRAFT_PROBLEM_MESSAGES,
  draftProblems,
  draftToPayload,
  draftTotals,
  type CashFlowCategory,
  type DraftLine,
} from "@/lib/manual-journal-draft";
import { useToast } from "@/lib/toast";

type ChartAccount = {
  id: string;
  code: string;
  name_en: string;
  name_tr: string;
  is_active: boolean;
};

function emptyLine(side: DraftLine["side"]): DraftLine {
  return {
    key: `${side}-${Math.random().toString(36).slice(2)}`,
    accountId: "",
    side,
    amountText: "",
  };
}

export function ManualJournalForm() {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [entryDate, setEntryDate] = useState(isoToday());
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    emptyLine("DEBIT"),
    emptyLine("CREDIT"),
  ]);
  const [cashFlowCategory, setCashFlowCategory] =
    useState<CashFlowCategory>("operating");
  const [unlockReason, setUnlockReason] = useState("");
  // Only asked for once the API says the month is sealed. Showing it up front
  // would invite people to unlock a period they had no need to touch.
  const [periodLocked, setPeriodLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityId) {
      setAccounts([]);
      return;
    }
    let cancelled = false;
    void apiFetch<{ items: ChartAccount[] }>(
      // 200 is MAX_LIST_LIMIT on the API; 500 fails validation with a 422 and
      // the .catch below turned that into an empty account picker.
      `/entities/${entityId}/chart-of-accounts?limit=200`,
    )
      .then((res) => {
        if (!cancelled) setAccounts(res.items.filter((a) => a.is_active));
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  const options = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.id,
        label: formatChartAccountLabel(account),
      })),
    [accounts],
  );

  const totals = draftTotals(lines);
  const problems = draftProblems(lines, description);

  const update = useCallback(
    (key: string, patch: Partial<DraftLine>) => {
      setLines((prev) =>
        prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
      );
    },
    [],
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = draftToPayload(lines, description, entryDate, {
      cashFlowCategory,
      periodUnlockReason: unlockReason,
    });
    if (!payload || !entityId) return;

    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/entities/${entityId}/manual-journals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast("Journal posted");
      setDescription("");
      setUnlockReason("");
      setPeriodLocked(false);
      setCashFlowCategory("operating");
      setLines([emptyLine("DEBIT"), emptyLine("CREDIT")]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not post the journal";
      // The API rejects a sealed month until a reason is given. Surface the
      // field rather than the raw rejection — otherwise the entry is simply
      // impossible with no hint that a way through exists.
      if (/period|closed|sealed|lock/i.test(message)) setPeriodLocked(true);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <FormPage
        title="New journal entry"
        meta="For corrections no other screen can make. Every line posts straight to the ledger, so say why in the description — it is the only record of your reasoning."
        width="wide"
        error={error}
        saveBar={
          <>
            <span className="mr-auto text-sm text-muted-foreground">
              Debits {formatTry(totals.debitKurus)} · Credits{" "}
              {formatTry(totals.creditKurus)}
              {totals.differenceKurus !== 0 && (
                <span className="ml-2 text-destructive">
                  out by {formatTry(Math.abs(totals.differenceKurus))}
                </span>
              )}
            </span>
            <Button type="submit" disabled={saving || problems.length > 0}>
              {saving ? "Posting…" : "Post journal"}
            </Button>
          </>
        }
      >
        <FormSection title="Entry">
          <div className="grid gap-3 sm:grid-cols-[12rem_10rem_1fr]">
            <div>
              <Label htmlFor="mj-date">Date</Label>
              <DateInput id="mj-date" value={entryDate} onChange={setEntryDate} required />
            </div>
            <div>
              <Label htmlFor="mj-cashflow">Cash flow</Label>
              <Select
                id="mj-cashflow"
                value={cashFlowCategory}
                onChange={(event) =>
                  setCashFlowCategory(event.target.value as CashFlowCategory)
                }
              >
                {CASH_FLOW_CATEGORIES.map((category) => (
                  <option
                    key={category.id}
                    value={category.id}
                    title={category.hint}
                  >
                    {category.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="mj-description">Why this entry exists</Label>
              <Input
                id="mj-description"
                value={description}
                maxLength={512}
                placeholder="e.g. Move opening balance equity to partner capital"
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
        </FormSection>

        {periodLocked && (
          <FormSection
            title="That month is closed"
            hint="Posting into a sealed month is allowed, but it is recorded. Say why, and the month is flagged as changed since it was closed."
          >
            <Label htmlFor="mj-unlock">Reason for reopening</Label>
            <Input
              id="mj-unlock"
              value={unlockReason}
              maxLength={512}
              placeholder="e.g. Accountant asked for the correction after close"
              onChange={(event) => setUnlockReason(event.target.value)}
            />
          </FormSection>
        )}

        <FormSection
          title="Lines"
          hint="Debits and credits must come to the same total."
          actions={
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLines((prev) => [...prev, emptyLine("DEBIT")])}
              >
                Add debit
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLines((prev) => [...prev, emptyLine("CREDIT")])}
              >
                Add credit
              </Button>
            </div>
          }
        >
          <div className="space-y-2">
            {lines.map((line) => (
              <div
                key={line.key}
                className="grid gap-2 sm:grid-cols-[7rem_1fr_10rem_auto] sm:items-end"
              >
                <div>
                  <Label>Side</Label>
                  <Select
                    value={line.side}
                    onChange={(event) =>
                      update(line.key, {
                        side: event.target.value as DraftLine["side"],
                      })
                    }
                  >
                    <option value="DEBIT">Debit</option>
                    <option value="CREDIT">Credit</option>
                  </Select>
                </div>
                <div className="min-w-0">
                  <Label>Account</Label>
                  <Combobox
                    value={line.accountId}
                    options={options}
                    placeholder="Search the chart…"
                    onValueChange={(value) =>
                      update(line.key, { accountId: value })
                    }
                  />
                </div>
                <div>
                  <Label>Amount</Label>
                  <MoneyInput
                    value={line.amountText}
                    showPreview={false}
                    onChange={(value) => update(line.key, { amountText: value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={lines.length <= 2}
                  title={
                    lines.length <= 2
                      ? "A journal needs at least two lines"
                      : undefined
                  }
                  onClick={() =>
                    setLines((prev) => prev.filter((l) => l.key !== line.key))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </FormSection>

        {problems.length > 0 && (
          <FormSection title="Before this can post">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {problems.map((problem) => (
                <li key={problem}>{DRAFT_PROBLEM_MESSAGES[problem]}</li>
              ))}
            </ul>
          </FormSection>
        )}
      </FormPage>
    </form>
  );
}
