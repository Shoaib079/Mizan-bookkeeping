"use client";

/** Mutate forms for invoice draft review (classify / link / post / reject). */

import { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import {
  acceptSuggestionLabel,
  confirmDraftLabel,
  invoiceKindLabel,
} from "@/lib/invoice-classification";
import type { InvoiceDraftCapabilities } from "@/lib/invoice-draft-capabilities";
import type {
  InvoiceDraft,
  InvoiceDraftAccount,
  SupplierOption,
} from "@/lib/invoice-draft-types";
import { formatExpenseAccountLabel } from "@/lib/expense-accounts";
import type { DeliveryPlatform } from "@/lib/pos-delivery-types";

type Props = {
  draft: InvoiceDraft;
  caps: InvoiceDraftCapabilities;
  suppliers: SupplierOption[];
  platforms: DeliveryPlatform[];
  expenseAccounts: InvoiceDraftAccount[];
  selectedSupplierId: string;
  setSelectedSupplierId: (id: string) => void;
  selectedPlatformId: string;
  setSelectedPlatformId: (id: string) => void;
  expenseAccountId: string;
  setExpenseAccountId: (id: string) => void;
  rejectReason: string;
  setRejectReason: (reason: string) => void;
  linking: boolean;
  linkingPlatform: boolean;
  confirming: boolean;
  posting: boolean;
  rejecting: boolean;
  unconfirming: boolean;
  settingKind: boolean;
  showChangeType: boolean;
  setShowChangeType: (show: boolean) => void;
  onLinkPlatform: (event: FormEvent) => void;
  onLinkSupplier: (event: FormEvent) => void;
  onConfirm: (event: FormEvent) => void;
  onConfirmAndPost: (event: FormEvent) => void;
  onPost: (event: FormEvent) => void;
  onUnconfirm: (event: FormEvent) => void;
  onReject: (event: FormEvent) => void;
  onSetKind: (
    nextKind: "supplier" | "delivery_commission",
    options?: { acceptSuggestion?: boolean },
  ) => void;
};

export function InvoiceDraftActionForms({
  draft,
  caps,
  suppliers,
  platforms,
  expenseAccounts,
  selectedSupplierId,
  setSelectedSupplierId,
  selectedPlatformId,
  setSelectedPlatformId,
  expenseAccountId,
  setExpenseAccountId,
  rejectReason,
  setRejectReason,
  linking,
  linkingPlatform,
  confirming,
  posting,
  rejecting,
  unconfirming,
  settingKind,
  showChangeType,
  setShowChangeType,
  onLinkPlatform,
  onLinkSupplier,
  onConfirm,
  onConfirmAndPost,
  onPost,
  onUnconfirm,
  onReject,
  onSetKind,
}: Props) {
  const {
    viewOnly,
    canLink,
    classificationReview,
    isCommission,
    needsPlatformLink,
    canOneClickPost,
    canPost,
    canUnconfirm,
    canConfirm,
    canReject,
    isTerminal,
    expenseAccountReview,
  } = caps;

  if (viewOnly) return null;

  return (
    <>
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

      {canLink && needsPlatformLink && (
        <form
          onSubmit={onLinkPlatform}
          className="rounded-lg border border-border bg-card p-4"
        >
          <h2 className="mb-2 text-sm font-semibold">Link delivery platform</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {isCommission
              ? "Commission posts to this platform's clearing account (not payables)."
              : "This seller is a delivery platform — link the platform to post as commission."}
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
                placement="above"
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
          <h2 className="mb-2 text-sm font-semibold">
            {isCommission ? "Post commission to clearing" : "Post to ledger"}
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {isCommission
              ? "Trusted commission invoice — confirm and post in one step."
              : "Trusted supplier invoice — confirm and post in one step."}
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
            {posting
              ? "Posting…"
              : isCommission
                ? "Post commission e-Fatura"
                : "Post invoice & payable"}
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
    </>
  );
}
