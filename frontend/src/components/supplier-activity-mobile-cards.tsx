"use client";

/** Phone cards for supplier activity — description leads, type · date under. */

import { EditedBadge } from "@/components/ledger/corrected-badge";
import { type CorrectableSupplierPaymentRow } from "@/components/forms/correct-supplier-payment-form";
import { SupplierActivityRowActions } from "@/components/supplier-activity-row-actions";
import type { SupplierActivityRow } from "@/components/supplier-activity-types";
import { Button } from "@/components/ui/button";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import {
  moneyAmountClassName,
  moneyLeadingIcon,
} from "@/lib/mobile-ledger-card";
import { formatTrDate, formatTry } from "@/lib/money";

type Props = {
  rows: SupplierActivityRow[];
  previewDraftId: string | null;
  reviewDraftId: string | null;
  onPreviewDraft: (draftId: string | null) => void;
  onReviewDraft: (draftId: string | null) => void;
  onCorrectPayment?: (row: CorrectableSupplierPaymentRow) => void;
  onEditInvoice?: (row: {
    journal_entry_id: string;
    movement_date: string;
    amount_kurus: number;
    description: string;
    expense_account_id?: string | null;
  }) => void;
  onVoid: (target: {
    description: string;
    kind: "payment" | "invoice";
    void_path: string;
  }) => void;
};

export function SupplierActivityMobileCards({
  rows,
  previewDraftId,
  reviewDraftId,
  onPreviewDraft,
  onReviewDraft,
  onCorrectPayment,
  onEditInvoice,
  onVoid,
}: Props) {
  return (
    <MobileCardList>
      {rows.map((row, index) => {
        const signed = row.amount_kurus ?? 0;
        return (
          <MobileCardRow
            key={`${row.movement_date}-${row.movement_kind}-${index}`}
            title={row.detail || row.movement_label}
            meta={
              <>
                <span>{row.movement_label}</span>
                <span>·</span>
                <span>{formatTrDate(row.movement_date)}</span>
                {row.document_ref ? <span>{row.document_ref}</span> : null}
                {row.was_corrected && <EditedBadge />}
              </>
            }
            amount={
              row.amount_kurus != null ? formatTry(row.amount_kurus) : "—"
            }
            amountClassName={
              row.amount_kurus != null
                ? moneyAmountClassName(signed)
                : undefined
            }
            leadingIcon={
              row.amount_kurus != null
                ? moneyLeadingIcon(signed)
                : undefined
            }
            trailing={
              <div className="mt-1 flex flex-wrap justify-end gap-1">
                {row.has_document && row.invoice_draft_id ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() =>
                      onPreviewDraft(
                        previewDraftId === row.invoice_draft_id
                          ? null
                          : row.invoice_draft_id,
                      )
                    }
                  >
                    {previewDraftId === row.invoice_draft_id ? "Hide" : "View"}
                  </Button>
                ) : null}
                <SupplierActivityRowActions
                  row={row}
                  onCorrectPayment={onCorrectPayment}
                  onEditInvoice={onEditInvoice}
                  onVoid={onVoid}
                />
                {row.invoice_draft_id &&
                  row.movement_kind === "unposted_invoice" && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      onClick={() =>
                        onReviewDraft(
                          reviewDraftId === row.invoice_draft_id
                            ? null
                            : row.invoice_draft_id,
                        )
                      }
                    >
                      {reviewDraftId === row.invoice_draft_id
                        ? "Hide"
                        : "Review"}
                    </Button>
                  )}
              </div>
            }
          />
        );
      })}
    </MobileCardList>
  );
}
