"use client";

/** Desktop supplier activity table — kept separate so the panel stays under
 * the file-size ratchet once mobile cards are forked beside it. */

import { EditedBadge } from "@/components/ledger/corrected-badge";
import { type CorrectableSupplierPaymentRow } from "@/components/forms/correct-supplier-payment-form";
import { SupplierActivityRowActions } from "@/components/supplier-activity-row-actions";
import type { SupplierActivityRow } from "@/components/supplier-activity-types";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { subledgerRowClassName } from "@/lib/ledger-display";
import { formatTrDate, formatTry } from "@/lib/money";
import { formatSupplierPayableBalance } from "@/lib/supplier-balance";

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

export function SupplierActivityTable({
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
    <DataTable wide>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Date</DataTableHeaderCell>
          <DataTableHeaderCell>Type</DataTableHeaderCell>
          {/* "Ref" said nothing: on an invoice row this column holds
              the supplier's invoice number, which is what anyone
              matching a statement is actually looking for. Payments
              keep their dekont number, and the header says so. */}
          <DataTableHeaderCell>Invoice / dekont no.</DataTableHeaderCell>
          <DataTableHeaderCell>Detail</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Net</DataTableHeaderCell>
          <DataTableHeaderCell align="right">KDV</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
          <DataTableHeaderCell>Bank</DataTableHeaderCell>
          <DataTableHeaderCell>Dekont</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Balance</DataTableHeaderCell>
          <DataTableHeaderCell>Doc</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {rows.map((row, index) => (
          <DataTableRow
            key={`${row.movement_date}-${row.movement_kind}-${index}`}
            className={subledgerRowClassName(row.display_kind)}
          >
            <DataTableCell>{formatTrDate(row.movement_date)}</DataTableCell>
            <DataTableCell>{row.movement_label}</DataTableCell>
            <DataTableCell>{row.document_ref}</DataTableCell>
            <DataTableCell
              className={
                !row.affects_balance || row.movement_label === "İptal"
                  ? "italic text-muted-foreground"
                  : undefined
              }
            >
              {row.detail}
              {row.was_corrected && (
                <span className="ml-2 not-italic">
                  <EditedBadge />
                </span>
              )}
            </DataTableCell>
            <DataTableCell align="right">
              {row.net_kurus != null ? formatTry(row.net_kurus) : "—"}
            </DataTableCell>
            <DataTableCell align="right">
              {row.vat_kurus != null ? formatTry(row.vat_kurus) : "—"}
            </DataTableCell>
            <DataTableCell align="right">
              {row.amount_kurus != null ? formatTry(row.amount_kurus) : "—"}
            </DataTableCell>
            <DataTableCell>{row.bank_name ?? "—"}</DataTableCell>
            <DataTableCell>{row.dekont_ref ?? "—"}</DataTableCell>
            <DataTableCell align="right">
              {formatSupplierPayableBalance(row.balance_kurus)}
            </DataTableCell>
            <DataTableCell>
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
              ) : (
                "—"
              )}
            </DataTableCell>
            <DataTableCell>
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
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
