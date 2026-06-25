"use client";

/** Invoice draft review — link supplier, confirm, post — Phase 9 Slice 3. */

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
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
  invoice_kind: string;
  invoice_number: string;
  invoice_date: string;
  supplier_name: string | null;
  supplier_vkn: string | null;
  supplier_id: string | null;
  delivery_report_id: string | null;
  linked_supplier_name: string | null;
  linked_supplier_vkn: string | null;
  net_kurus: number;
  gross_kurus: number;
  vat_breakdown: VatLine[];
  review_reason: string | null;
};

type DeliveryReportOption = {
  id: string;
  platform_name: string;
  report_date: string;
  gross_kurus: number;
  commission_kurus: number;
  status: string;
  commission_journal_entry_id: string | null;
};

type SupplierOption = { id: string; name: string; vkn: string };
type Account = { id: string; code: string; name: string };

type Props = {
  draftId: string;
  onUpdated?: () => void;
};

export function InvoiceDraftReview({ draftId, onUpdated }: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [deliveryReports, setDeliveryReports] = useState<DeliveryReportOption[]>(
    [],
  );
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkingReport, setLinkingReport] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [posting, setPosting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) return;
    const [draftRes, supRes, chartRes, reportsRes] = await Promise.all([
      apiFetch<InvoiceDraft>(
        `/entities/${entityId}/invoices/drafts/${draftId}`,
      ),
      apiFetch<{ items: SupplierOption[] }>(
        `/entities/${entityId}/suppliers?limit=100`,
      ),
      apiFetch<{ items: Account[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ),
      apiFetch<{ items: DeliveryReportOption[] }>(
        `/entities/${entityId}/delivery/reports?status=posted&limit=50`,
      ),
    ]);
    setDraft(draftRes);
    setSuppliers(supRes.items);
    setDeliveryReports(
      reportsRes.items.filter((r) => r.commission_journal_entry_id === null),
    );
    const isCommission = draftRes.invoice_kind === "delivery_commission";
    const expenses = chartRes.items.filter((a) =>
      isCommission ? a.code === "5500" : ["5200", "5300"].includes(a.code),
    );
    setExpenseAccounts(expenses);
    if (expenses[0]) setExpenseAccountId(expenses[0].id);
    if (draftRes.supplier_id) setSelectedSupplierId(draftRes.supplier_id);
    if (draftRes.delivery_report_id) {
      setSelectedReportId(draftRes.delivery_report_id);
    }
  }, [entityId, draftId]);

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "Load failed"),
    );
  }, [load]);

  async function onLinkReport(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !draft || !selectedReportId) return;
    setLinkingReport(true);
    setError(null);
    try {
      const updated = await apiFetch<InvoiceDraft>(
        `/entities/${entityId}/invoices/drafts/${draftId}/link-delivery-report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delivery_report_id: selectedReportId }),
        },
      );
      setDraft(updated);
      onUpdated?.();
      toast("Delivery report linked");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link report failed");
    } finally {
      setLinkingReport(false);
    }
  }

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
      toast("Supplier linked");
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
      toast("Invoice confirmed");
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
      toast("Invoice posted");
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
      toast("Invoice rejected");
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
  const canLink =
    draft.status === "draft" || draft.status === "needs_review";
  const canConfirm =
    (draft.status === "draft" || draft.status === "needs_review") &&
    Boolean(draft.supplier_id) &&
    (!isCommission || Boolean(draft.delivery_report_id));
  const canPost = draft.status === "confirmed";
  const isTerminal =
    draft.status === "posted" || draft.status === "rejected";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={draft.status} />
        {isCommission && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Delivery commission
          </span>
        )}
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

      {canLink && !isCommission && (
        <form
          onSubmit={onLinkReport}
          className="rounded-lg border border-border bg-card p-4"
        >
          <h2 className="mb-2 text-sm font-semibold">
            Link delivery report (commission e-Fatura)
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Optional: link a posted delivery report to treat this invoice as
            platform commission (credits clearing, not payables).
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <Label htmlFor="link-report">Posted report</Label>
              <Combobox
                id="link-report"
                value={selectedReportId}
                onValueChange={setSelectedReportId}
                options={[
                  { value: "", label: "Select report…" },
                  ...deliveryReports.map((r) => ({
                    value: r.id,
                    label: `${r.platform_name} · ${formatTrDate(r.report_date)} · ${formatTry(r.commission_kurus)} commission`,
                  })),
                ]}
                placeholder="Select report…"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={linkingReport || !selectedReportId}
            >
              {linkingReport ? "Linking…" : "Link report"}
            </Button>
          </div>
        </form>
      )}

      {canLink && isCommission && draft.delivery_report_id && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Linked delivery report</h2>
          <p className="text-sm text-muted-foreground">
            Report ID {draft.delivery_report_id.slice(0, 8)}… — commission
            invoice gross must match report commission.
          </p>
        </div>
      )}

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

      {canPost && (
        <div className="rounded-lg border border-border bg-card p-4">
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
                  {a.code} — {a.name}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={onPost} disabled={posting}>
            {posting
              ? "Posting…"
              : isCommission
                ? "Post commission e-Fatura"
                : "Post invoice & payable"}
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
