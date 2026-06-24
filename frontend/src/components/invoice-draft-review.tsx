"use client";

/** Invoice draft review — link supplier, confirm, post — Phase 9 Slice 3. */

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";

type VatLine = {
  rate_percent: number;
  base_kurus: number;
  vat_kurus: number;
};

type InvoiceDraft = {
  id: string;
  status: string;
  invoice_number: string;
  invoice_date: string;
  supplier_name: string | null;
  supplier_vkn: string | null;
  supplier_id: string | null;
  linked_supplier_name: string | null;
  linked_supplier_vkn: string | null;
  net_kurus: number;
  gross_kurus: number;
  vat_breakdown: VatLine[];
  review_reason: string | null;
};

type SupplierOption = { id: string; name: string; vkn: string };
type Account = { id: string; code: string; name: string };

type Props = {
  draftId: string;
  onUpdated?: () => void;
};

export function InvoiceDraftReview({ draftId, onUpdated }: Props) {
  const { entityId, actorId } = useEntity();
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [posting, setPosting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) return;
    const [draftRes, supRes, chartRes] = await Promise.all([
      apiFetch<InvoiceDraft>(
        `/entities/${entityId}/invoices/drafts/${draftId}`,
      ),
      apiFetch<{ items: SupplierOption[] }>(
        `/entities/${entityId}/suppliers?limit=100`,
      ),
      apiFetch<{ items: Account[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ),
    ]);
    setDraft(draftRes);
    setSuppliers(supRes.items);
    const expenses = chartRes.items.filter((a) =>
      ["5200", "5300"].includes(a.code),
    );
    setExpenseAccounts(expenses);
    if (expenses[0]) setExpenseAccountId(expenses[0].id);
    if (draftRes.supplier_id) setSelectedSupplierId(draftRes.supplier_id);
  }, [entityId, draftId]);

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "Load failed"),
    );
  }, [load]);

  async function onLinkSupplier(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !draft) return;
    setLinking(true);
    setError(null);
    try {
      const updated = await apiFetch<InvoiceDraft>(
        `/entities/${entityId}/invoices/drafts/${draftId}/link-supplier`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplier_id: selectedSupplierId || null,
          }),
        },
      );
      setDraft(updated);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link failed");
    } finally {
      setLinking(false);
    }
  }

  async function onConfirm() {
    if (!entityId || !draft) return;
    setConfirming(true);
    setError(null);
    try {
      const updated = await apiFetch<InvoiceDraft>(
        `/entities/${entityId}/invoices/drafts/${draftId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actor_id: actorId }),
        },
      );
      setDraft(updated);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setConfirming(false);
    }
  }

  async function onPost() {
    if (!entityId || !draft) return;
    setPosting(true);
    setError(null);
    try {
      await apiFetch(
        `/entities/${entityId}/invoices/drafts/${draftId}/post`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actor_id: actorId,
            expense_account_id: expenseAccountId,
          }),
        },
      );
      await load();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post failed");
    } finally {
      setPosting(false);
    }
  }

  async function onReject() {
    if (!entityId || !draft) return;
    setRejecting(true);
    setError(null);
    try {
      const updated = await apiFetch<InvoiceDraft>(
        `/entities/${entityId}/invoices/drafts/${draftId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectReason || null }),
        },
      );
      setDraft(updated);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setRejecting(false);
    }
  }

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar to review this invoice.
      </p>
    );
  }

  if (!draft) {
    return <p className="text-sm text-muted-foreground">Loading invoice…</p>;
  }

  const canLink =
    draft.status === "draft" || draft.status === "needs_review";
  const canConfirm =
    (draft.status === "draft" || draft.status === "needs_review") &&
    Boolean(draft.supplier_id);
  const canPost = draft.status === "confirmed";
  const isTerminal =
    draft.status === "posted" || draft.status === "rejected";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={draft.status} />
        <span className="text-sm text-muted-foreground">
          {draft.invoice_number} · {formatTrDate(draft.invoice_date)}
        </span>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Supplier</h2>
        {draft.linked_supplier_name ? (
          <p className="text-sm">
            {draft.linked_supplier_name}
            {draft.linked_supplier_vkn && (
              <span className="ml-2 text-muted-foreground">
                VKN {draft.linked_supplier_vkn}
              </span>
            )}
            {draft.supplier_id && (
              <Link
                href={`/suppliers/${draft.supplier_id}`}
                className="ml-2 text-primary hover:underline"
              >
                View supplier
              </Link>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {draft.supplier_name ?? "Unknown"} · VKN{" "}
            {draft.supplier_vkn ?? "—"}
          </p>
        )}
        {draft.review_reason && (
          <p className="mt-2 text-sm text-warning">{draft.review_reason}</p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Amounts</h2>
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Net</dt>
            <dd className="tabular-nums">{formatTry(draft.net_kurus)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Gross</dt>
            <dd className="tabular-nums font-medium">
              {formatTry(draft.gross_kurus)}
            </dd>
          </div>
        </dl>
        {draft.vat_breakdown.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            {draft.vat_breakdown.map((line) => (
              <li key={line.rate_percent}>
                KDV {line.rate_percent}% — base {formatTry(line.base_kurus)},
                VAT {formatTry(line.vat_kurus)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canLink && (
        <form
          onSubmit={onLinkSupplier}
          className="rounded-lg border border-border bg-card p-4"
        >
          <h2 className="mb-2 text-sm font-semibold">Link supplier</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Pick a supplier or leave blank to auto-match by VKN on the invoice.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <Label htmlFor="link-supplier">Supplier</Label>
              <Select
                id="link-supplier"
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
              >
                <option value="">Auto-match by VKN</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.vkn})
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="secondary" disabled={linking}>
              {linking ? "Linking…" : "Link"}
            </Button>
          </div>
        </form>
      )}

      {canPost && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Post to ledger</h2>
          <div className="mb-3">
            <Label htmlFor="exp-account">Expense account</Label>
            <Select
              id="exp-account"
              value={expenseAccountId}
              onChange={(e) => setExpenseAccountId(e.target.value)}
            >
              {expenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={onPost} disabled={posting}>
            {posting ? "Posting…" : "Post invoice & payable"}
          </Button>
        </div>
      )}

      {!isTerminal && (
        <div className="flex flex-wrap gap-2">
          {canConfirm && (
            <Button onClick={onConfirm} disabled={confirming}>
              {confirming ? "Confirming…" : "Confirm draft"}
            </Button>
          )}
          {(draft.status === "draft" || draft.status === "needs_review") && (
            <div className="flex flex-1 flex-wrap items-end gap-2">
              <div className="min-w-[160px] flex-1">
                <Label htmlFor="reject-reason">Reject reason</Label>
                <Input
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <Button
                variant="secondary"
                onClick={onReject}
                disabled={rejecting}
              >
                {rejecting ? "Rejecting…" : "Reject"}
              </Button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
