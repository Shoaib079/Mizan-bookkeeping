"use client";

/** Preview banner + allocation split table. */

import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import type { PartnerProfitPreviewResponse } from "@/components/forms/partner-profit-allocation-types";
import { formatTrDate, formatTry } from "@/lib/money";

export type PartnerProfitAllocationPreviewProps = {
  preview: PartnerProfitPreviewResponse;
  sourceBanner: string | null;
};

export function PartnerProfitAllocationPreview({
  preview,
  sourceBanner,
}: PartnerProfitAllocationPreviewProps) {
  return (
    <div className="space-y-2">
      {sourceBanner && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          {sourceBanner}
        </p>
      )}
      {preview.netting_as_of && preview.net_against_drawings && (
        <p className="text-xs text-muted-foreground">
          Netting uses partner balances on or before{" "}
          {formatTrDate(preview.netting_as_of)}.
        </p>
      )}
      {/* Scrolls rather than clips where the width still is not enough
          — a phone dialog is full-screen at every size, and the money
          columns no longer wrap to make themselves fit. */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <DataTable>
          <DataTableHead>
            <DataTableRow>
              <DataTableHeaderCell>Partner</DataTableHeaderCell>
              <DataTableHeaderCell>Share</DataTableHeaderCell>
              {preview.net_against_drawings && (
                <>
                  <DataTableHeaderCell align="right">Gross</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Offset</DataTableHeaderCell>
                </>
              )}
              <DataTableHeaderCell align="right">Allocate</DataTableHeaderCell>
            </DataTableRow>
          </DataTableHead>
          <DataTableBody>
            {preview.lines.map((line) => (
              <DataTableRow key={line.partner_id}>
                <DataTableCell>{line.partner_name}</DataTableCell>
                <DataTableCell>{line.ownership_share_pct}%</DataTableCell>
                {preview.net_against_drawings && (
                  <>
                    <DataTableCell
                      align="right"
                      className="whitespace-nowrap tabular-nums"
                    >
                      {formatTry(line.gross_amount_kurus)}
                    </DataTableCell>
                    <DataTableCell
                      align="right"
                      className="whitespace-nowrap tabular-nums"
                    >
                      {line.offset_kurus > 0
                        ? `−${formatTry(line.offset_kurus)}`
                        : "—"}
                    </DataTableCell>
                  </>
                )}
                <DataTableCell
                  align="right"
                  className="whitespace-nowrap tabular-nums"
                >
                  {formatTry(line.amount_kurus)}
                </DataTableCell>
              </DataTableRow>
            ))}
            <DataTableRow>
              <DataTableCell className="font-medium">Total</DataTableCell>
              <DataTableCell>{""}</DataTableCell>
              {preview.net_against_drawings && (
                <>
                  <DataTableCell
                    align="right"
                    className="whitespace-nowrap font-medium tabular-nums"
                  >
                    {formatTry(preview.total_profit_kurus)}
                  </DataTableCell>
                  <DataTableCell>{""}</DataTableCell>
                </>
              )}
              <DataTableCell
                align="right"
                className="whitespace-nowrap font-medium tabular-nums"
              >
                {formatTry(preview.total_allocated_kurus)}
              </DataTableCell>
            </DataTableRow>
          </DataTableBody>
        </DataTable>
      </div>
    </div>
  );
}
