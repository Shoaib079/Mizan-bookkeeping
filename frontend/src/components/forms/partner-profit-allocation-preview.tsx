"use client";

/** Preview banner + allocation split — table on desktop, cards on phone. */

import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import type { PartnerProfitPreviewResponse } from "@/components/forms/partner-profit-allocation-types";
import { DESKTOP_SHELL_ONLY, MOBILE_SHELL_ONLY } from "@/lib/mobile-shell";
import { formatTrDate, formatTry } from "@/lib/money";
import { cn } from "@/lib/utils";

export type PartnerProfitAllocationPreviewProps = {
  preview: PartnerProfitPreviewResponse;
  sourceBanner: string | null;
};

export function PartnerProfitAllocationPreview({
  preview,
  sourceBanner,
}: PartnerProfitAllocationPreviewProps) {
  const netting = preview.net_against_drawings;

  return (
    <div className="space-y-2">
      {sourceBanner && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          {sourceBanner}
        </p>
      )}
      {preview.netting_as_of && netting && (
        <p className="text-xs text-muted-foreground">
          Netting uses partner balances on or before{" "}
          {formatTrDate(preview.netting_as_of)}.
        </p>
      )}

      <MobileCardList className={MOBILE_SHELL_ONLY}>
        {preview.lines.map((line) => (
          <MobileCardRow
            key={line.partner_id}
            title={line.partner_name}
            meta={
              <>
                <span>{line.ownership_share_pct}% share</span>
                {netting ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>Gross {formatTry(line.gross_amount_kurus)}</span>
                    {line.offset_kurus > 0 ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>Offset −{formatTry(line.offset_kurus)}</span>
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            }
            amount={formatTry(line.amount_kurus)}
          />
        ))}
        <MobileCardRow
          title="Total"
          meta={
            netting ? (
              <span>Gross {formatTry(preview.total_profit_kurus)}</span>
            ) : undefined
          }
          amount={formatTry(preview.total_allocated_kurus)}
        />
      </MobileCardList>

      <div
        className={cn(
          DESKTOP_SHELL_ONLY,
          "overflow-x-auto rounded-lg border border-border",
        )}
      >
        <DataTable>
          <DataTableHead>
            <DataTableRow>
              <DataTableHeaderCell>Partner</DataTableHeaderCell>
              <DataTableHeaderCell>Share</DataTableHeaderCell>
              {netting && (
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
                {netting && (
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
              {netting && (
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
