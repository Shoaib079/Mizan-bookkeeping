"use client";

/** State + mutate handlers for InvoiceDraftReview (file-size split). */

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api";
import {
  filterExpenseAccounts,
  findExpenseAccountByCode,
} from "@/lib/expense-accounts";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import { isInvoiceDraftReadOnly } from "@/lib/invoice-draft-list";
import { invoiceKindLabel, needsClassificationReview } from "@/lib/invoice-classification";
import type { DeliveryPlatform } from "@/lib/pos-delivery-types";
import {
  DELIVERY_COMMISSION_EXPENSE_CODE,
  GENERAL_EXPENSE_CODE,
} from "@/lib/account-codes";
import type {
  InvoiceDraft,
  InvoiceDraftAccount,
  SupplierOption,
} from "@/lib/invoice-draft-types";

export function useInvoiceDraftReview(args: {
  draftId: string;
  embedded: boolean;
  readOnly: boolean;
  onUpdated?: (outcome?: "removed" | "updated") => void;
}) {
  const { draftId, embedded, readOnly, onUpdated } = args;
  const router = useRouter();
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [platforms, setPlatforms] = useState<DeliveryPlatform[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<InvoiceDraftAccount[]>(
    [],
  );
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
    const draftRes = await apiFetch<InvoiceDraft>(
      `/entities/${entityId}/invoices/drafts/${draftId}`,
    );
    setDraft(draftRes);
    if (readOnly || isInvoiceDraftReadOnly(draftRes.status)) {
      return;
    }
    const [supRes, chartRes, platformRes] = await Promise.all([
      apiFetch<{ items: SupplierOption[] }>(
        `/entities/${entityId}/suppliers?include_inactive=false&limit=100`,
      ),
      apiFetch<{ items: InvoiceDraftAccount[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ),
      apiFetch<{ items: DeliveryPlatform[] }>(
        `/entities/${entityId}/delivery/platforms?include_inactive=false&limit=50`,
      ),
    ]);
    setSuppliers(supRes.items);
    setPlatforms(platformRes.items.filter((p) => p.is_active));
    const isCommission = draftRes.invoice_kind === "delivery_commission";
    const expenses = isCommission
      ? chartRes.items.filter((a) => a.code === DELIVERY_COMMISSION_EXPENSE_CODE)
      : filterExpenseAccounts(chartRes.items);
    setExpenseAccounts(expenses);
    const suggested = draftRes.suggested_expense_account_id;
    const suggestedAccount = suggested
      ? expenses.find((a) => a.id === suggested)
      : undefined;
    const preferred = isCommission
      ? expenses[0]
      : suggestedAccount ??
        findExpenseAccountByCode(chartRes.items, GENERAL_EXPENSE_CODE);
    if (preferred) setExpenseAccountId(preferred.id);
    else if (expenses[0]) setExpenseAccountId(expenses[0].id);
    if (draftRes.supplier_id) setSelectedSupplierId(draftRes.supplier_id);
    if (draftRes.delivery_platform_id) {
      setSelectedPlatformId(draftRes.delivery_platform_id);
    }
  }, [entityId, draftId, readOnly]);

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

  return {
    entityId, draft, suppliers, platforms, expenseAccounts,
    selectedSupplierId, setSelectedSupplierId,
    selectedPlatformId, setSelectedPlatformId,
    expenseAccountId, setExpenseAccountId,
    rejectReason, setRejectReason, error,
    linking, linkingPlatform, confirming, posting, rejecting, unconfirming,
    settingKind, showChangeType, setShowChangeType,
    onLinkPlatform, onLinkSupplier, onConfirm, onConfirmAndPost, onPost,
    onUnconfirm, onSetKind, onReject, onUpdated,
  };
}
