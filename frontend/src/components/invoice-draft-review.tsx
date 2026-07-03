"use client";

/** Invoice draft review — link supplier/platform, confirm, post — Phase 9 Slice 3. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { InvoiceDocumentPreview } from "@/components/invoice-document-preview";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import {
  filterExpenseAccounts,
  findExpenseAccountByCode,
  formatExpenseAccountLabel,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  canDiscardInvoiceDraft,
  canUnconfirmInvoiceDraft,
} from "@/lib/review-status";
import {
  acceptSuggestionLabel,
  confirmDraftLabel,
  invoiceKindLabel,
  needsClassificationReview,
} from "@/lib/invoice-classification";
import type { DeliveryPlatform } from "@/lib/pos-delivery-types";

type VatLine = {
  rate_percent: number;
  base_kurus: number;
  vat_kurus: number;
};

type InvoiceDraft = {
  id: string;
  status: string;
  invoice_kind: string;
  invoice_number: string;
  invoice_date: string;
  supplier_name: string | null;
  supplier_vkn: string | null;
  supplier_id: string | null;
  delivery_platform_id: string | null;
  linked_supplier_name: string | null;
  linked_supplier_vkn: string | null;
  linked_platform_name: string | null;
  net_kurus: number;
  gross_kurus: number;
  vat_breakdown: VatLine[];
  review_reason: string | null;
  classification_confidence: "high" | "medium" | "low" | null;
  has_stored_document: boolean;
  source_type: string;
  suggested_expense_account_id: string | null;
  expense_account_confidence: "high" | "medium" | "low" | null;
  one_click_post_eligible: boolean;
};

type SupplierOption = { id: string; name: string; vkn: string };
type Account = ChartAccount;

type Props = {
  draftId: string;
  embedded?: boolean;
  /** `removed` when the draft leaves the workbench (reject/post); else keep panel open. */
  onUpdated?: (outcome?: "removed" | "updated") => void;
};

export function InvoiceDraftReview({ draftId, embedded = false, onUpdated }: Props) {
  const router = useRouter();
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [platforms, setPlatforms] = useState<DeliveryPlatform[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedPlatformId, setSelectedPlatformId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkingPlatform, setLinkingPlatform] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [posting, setPosting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [unconfirming, setUnconfirming] = useState(false);
  const [settingKind, setSettingKind] = useState(false);
  const [showChangeType, setShowChangeType] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) return;
    const [draftRes, supRes, chartRes, platformRes] = await Promise.all([
      apiFetch<InvoiceDraft>(
        `/entities/${entityId}/invoices/drafts/${draftId}`,
      ),
      apiFetch<{ items: SupplierOption[] }>(
        `/entities/${entityId}/suppliers?include_inactive=true&limit=100`,
      ),
      apiFetch<{ items: Account[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ),
      apiFetch<{ items: DeliveryPlatform[] }>(
        `/entities/${entityId}/delivery/platforms?include_inactive=false&limit=50`,
      ),
    ]);
    setDraft(draftRes);
    setSuppliers(supRes.items);
    setPlatforms(platformRes.items.filter((p) => p.is_active));
    const isCommission = draftRes.invoice_kind === "delivery_commission";
    const expenses = isCommission
      ? chartRes.items.filter((a) => a.code === "5500")
      : filterExpenseAccounts(chartRes.items);
    setExpenseAccounts(expenses);
    const suggested = draftRes.suggested_expense_account_id;
    const suggestedAccount = suggested
      ? expenses.find((a) => a.id === suggested)
      : undefined;
    const highConfidence = draftRes.expense_account_confidence === "high";
    const preferred = isCommission
      ? expenses[0]
      : highConfidence && suggestedAccount
        ? suggestedAccount
        : findExpenseAccountByCode(chartRes.items, "5200");
    if (preferred) setExpenseAccountId(preferred.id);
    else if (expenses[0]) setExpenseAccountId(expenses[0].id);
    if (draftRes.supplier_id) setSelectedSupplierId(draftRes.supplier_id);
    if (draftRes.delivery_platform_id) {
      setSelectedPlatformId(draftRes.delivery_platform_id);
    }
  }, [entityId, draftId]);

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "Load failed"),
    );
  }, [load]);

  async function onLinkPlatform(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !draft || !selectedPlatformId) return;
    setLinkingPlatform(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const updated = await apiFetch<InvoiceDraft>(
        `/entities/${entityId}/invoices/drafts/${draftId}/link-delivery-platform`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delivery_platform_id: selectedPlatformId }),
        },
      );
      submitIdempotency.completeSubmit();
      setDraft(updated);
      onUpdated?.("updated");
      toast("Delivery platform linked");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link platform failed");
    } finally {
      setLinkingPlatform(false);
    }
  }

  async function onLinkSupplier(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !draft) return;
    setLinking(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const updated = await apiFetch<InvoiceDraft>(
        `/entities/${entityId}/invoices/drafts/${draftId}/link-supplier`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplier_id: selectedSupplierId || null,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      setDraft(updated);
      onUpdated?.("updated");
      toast("Supplier linked");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link failed");
    } finally {
      setLinking(false);
    }
  }

  async function onConfirm(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !draft) return;
    setConfirming(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const updated = await apiFetch<InvoiceDraft>(
        `/entities/${entityId}/invoices/drafts/${draftId}/confirm`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actor_id: actorId }),
        },
      );
      submitIdempotency.completeSubmit();
      setDraft(updated);
      onUpdated?.("updated");
      toast("Invoice confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setConfirming(false);
    }
  }

  async function onConfirmAndPost(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !draft) return;
    setPosting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/invoices/drafts/${draftId}/confirm-and-post`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actor_id: actorId,
            expense_account_id: expenseAccountId,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      toast("Invoice posted");
      onUpdated?.("removed");
      if (!embedded) {
        router.push("/review/invoices");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post failed");
    } finally {
      setPosting(false);
    }
  }

  async function onPost(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !draft) return;
    setPosting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/invoices/drafts/${draftId}/post`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actor_id: actorId,
            expense_account_id: expenseAccountId,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      toast("Invoice posted");
      onUpdated?.("removed");
      if (!embedded) {
        router.push("/review/invoices");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post failed");
    } finally {
      setPosting(false);
    }
  }

  async function onUnconfirm(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !draft) return;
    setUnconfirming(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const updated = await apiFetch<InvoiceDraft>(
        `/entities/${entityId}/invoices/drafts/${draftId}/unconfirm`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actor_id: actorId,
            reason: rejectReason || null,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      setDraft(updated);
      onUpdated?.("updated");
      toast("Invoice sent back to review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unconfirm failed");
    } finally {
      setUnconfirming(false);
    }
  }

  async function onSetKind(
    nextKind: "supplier" | "delivery_commission",
    options?: { acceptSuggestion?: boolean },
  ) {
    if (!entityId || !draft) return;
    if (
      !options?.acceptSuggestion &&
      draft.invoice_kind === nextKind &&
      !needsClassificationReview(draft.classification_confidence)
    ) {
      return;
    }
    setSettingKind(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const updated = await apiFetch<InvoiceDraft>(
        `/entities/${entityId}/invoices/drafts/${draftId}/set-kind`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoice_kind: nextKind }),
        },
      );
      submitIdempotency.completeSubmit();
      setDraft(updated);
      setShowChangeType(false);
      onUpdated?.("updated");
      toast(
        options?.acceptSuggestion
          ? `Accepted as ${invoiceKindLabel(nextKind).toLowerCase()}`
          : nextKind === "delivery_commission"
            ? "Classified as delivery commission"
            : "Classified as supplier expense",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reclassify failed");
    } finally {
      setSettingKind(false);
    }
  }

  async function onReject(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !draft) return;
    setRejecting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch<void>(
        `/entities/${entityId}/invoices/drafts/${draftId}/reject`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectReason || null }),
        },
      );
      submitIdempotency.completeSubmit();
      onUpdated?.("removed");
      toast("Invoice rejected");
      if (!embedded) {
        router.push("/review/invoices");
      }
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

  const isCommission = draft.invoice_kind === "delivery_commission";
  const classificationReview = needsClassificationReview(
    draft.classification_confidence,
  );
  const expenseAccountReview = needsClassificationReview(
    draft.expense_account_confidence,
  );
  const canLink =
    draft.status === "draft" || draft.status === "needs_review";
  const canConfirm =
    (draft.status === "draft" || draft.status === "needs_review") &&
    (isCommission
      ? Boolean(draft.delivery_platform_id)
      : Boolean(draft.supplier_id));
  const canPost = draft.status === "confirmed";
  const canOneClickPost =
    draft.one_click_post_eligible &&
    canLink &&
    !isCommission &&
    Boolean(draft.supplier_id);
  const canUnconfirm = canUnconfirmInvoiceDraft(draft.status);
  const canReject = canDiscardInvoiceDraft(draft.status);
  const isTerminal =
    draft.status === "posted" || draft.status === "rejected";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={draft.status} />
        <span
          className={
            isCommission
              ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
          }
        >
          {invoiceKindLabel(draft.invoice_kind)}
        </span>
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

      {draft.has_stored_document && (
        <div className="rounded-lg border border-border bg-card p-4">
          <InvoiceDocumentPreview
            draftId={draft.id}
            sourceType={
              draft.source_type === "efatura_xml"
                ? "efatura_xml"
                : "efatura_pdf"
            }
          />
        </div>
      )}

      {isCommission && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Delivery platform</h2>
          {draft.linked_platform_name ? (
            <p className="text-sm">{draft.linked_platform_name}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Not linked yet</p>
          )}
        </div>
      )}

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

      {canLink && classificationReview && !showChangeType && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold">Suggested type</h2>
          <p className="mb-3 text-sm">{invoiceKindLabel(draft.invoice_kind)}</p>
          {draft.review_reason && (
            <p className="mb-3 text-sm text-warning">{draft.review_reason}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={settingKind}
              onClick={() =>
                void onSetKind(
                  draft.invoice_kind as "supplier" | "delivery_commission",
                  { acceptSuggestion: true },
                )
              }
            >
              {acceptSuggestionLabel(draft.invoice_kind)}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={settingKind}
              onClick={() => setShowChangeType(true)}
            >
              Change type
            </Button>
          </div>
        </div>
      )}

      {canLink && classificationReview && showChangeType && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Change invoice type</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Pick how this e-Fatura should post before confirm.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={!isCommission ? "primary" : "secondary"}
              disabled={settingKind || !isCommission}
              onClick={() => void onSetKind("supplier")}
            >
              Supplier expense
            </Button>
            <Button
              type="button"
              variant={isCommission ? "primary" : "secondary"}
              disabled={settingKind || isCommission}
              onClick={() => void onSetKind("delivery_commission")}
            >
              Delivery commission
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={settingKind}
              onClick={() => setShowChangeType(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {canLink && isCommission && !draft.delivery_platform_id && (
        <form
          onSubmit={onLinkPlatform}
          className="rounded-lg border border-border bg-card p-4"
        >
          <h2 className="mb-2 text-sm font-semibold">Link delivery platform</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Commission posts to this platform&apos;s clearing account (not
            payables).
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <Label htmlFor="link-platform">Platform</Label>
              <Combobox
                id="link-platform"
                value={selectedPlatformId}
                onValueChange={setSelectedPlatformId}
                options={[
                  { value: "", label: "Select platform…" },
                  ...platforms.map((p) => ({
                    value: p.id,
                    label: p.name,
                  })),
                ]}
                placeholder="Select platform…"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={linkingPlatform || !selectedPlatformId}
            >
              {linkingPlatform ? "Linking…" : "Link platform"}
            </Button>
          </div>
        </form>
      )}

      {canLink && !isCommission && (
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
              <Combobox
                id="link-supplier"
                value={selectedSupplierId}
                onValueChange={setSelectedSupplierId}
                options={[
                  { value: "", label: "Auto-match by VKN" },
                  ...suppliers.map((s) => ({
                    value: s.id,
                    label: `${s.name} (${s.vkn})`,
                  })),
                ]}
                placeholder="Auto-match by VKN"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={linking}>
              {linking ? "Linking…" : "Link"}
            </Button>
          </div>
        </form>
      )}

      {canOneClickPost && (
        <form
          onSubmit={onConfirmAndPost}
          className="rounded-lg border border-border bg-card p-4"
        >
          <h2 className="mb-2 text-sm font-semibold">Post to ledger</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Trusted supplier invoice — confirm and post in one step.
          </p>
          <div className="mb-3">
            <Label htmlFor="one-click-exp-account">Expense account</Label>
            <Select
              id="one-click-exp-account"
              value={expenseAccountId}
              onChange={(e) => setExpenseAccountId(e.target.value)}
            >
              {expenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatExpenseAccountLabel(a)}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" disabled={posting || !expenseAccountId}>
            {posting ? "Posting…" : "Post invoice & payable"}
          </Button>
        </form>
      )}

      {canPost && (
        <form
          onSubmit={onPost}
          className="rounded-lg border border-border bg-card p-4"
        >
          <h2 className="mb-2 text-sm font-semibold">
            {isCommission ? "Post commission to clearing" : "Post to ledger"}
          </h2>
          <div className="mb-3">
            <Label htmlFor="exp-account">
              {isCommission ? "Commission expense (5500)" : "Expense account"}
            </Label>
            <Select
              id="exp-account"
              value={expenseAccountId}
              onChange={(e) => setExpenseAccountId(e.target.value)}
            >
              {expenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatExpenseAccountLabel(a)}
                </option>
              ))}
            </Select>
            {expenseAccountReview && draft.suggested_expense_account_id && (
              <p className="mt-2 text-xs text-muted-foreground">
                Learned expense account suggestion — confirm or pick another
                account.
              </p>
            )}
          </div>
          <Button type="submit" disabled={posting}>
            {posting
              ? "Posting…"
              : isCommission
                ? "Post commission e-Fatura"
                : "Post invoice & payable"}
          </Button>
        </form>
      )}

      {!isTerminal && (
        <div className="flex flex-wrap gap-2">
          {canUnconfirm && (
            <form onSubmit={onUnconfirm}>
              <Button type="submit" variant="secondary" disabled={unconfirming}>
                {unconfirming ? "Sending back…" : "Send back to review"}
              </Button>
            </form>
          )}
          {canConfirm && !canOneClickPost && (
            <form onSubmit={onConfirm}>
              <Button type="submit" disabled={confirming}>
                {confirming ? "Confirming…" : confirmDraftLabel(draft.invoice_kind)}
              </Button>
            </form>
          )}
          {canReject && (
            <form
              onSubmit={onReject}
              className="flex flex-1 flex-wrap items-end gap-2"
            >
              <div className="min-w-[160px] flex-1">
                <Label htmlFor="reject-reason">Reject reason</Label>
                <Input
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <Button type="submit" variant="secondary" disabled={rejecting}>
                {rejecting
                  ? "Rejecting…"
                  : draft.status === "duplicate"
                    ? "Remove duplicate"
                    : draft.status === "confirmed"
                      ? "Discard"
                      : "Reject"}
              </Button>
            </form>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
