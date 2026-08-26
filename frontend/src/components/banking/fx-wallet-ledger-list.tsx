"use client";

/** FX wallet ledger — desktop table / phone cards. */

import { EditedBadge } from "@/components/ledger/corrected-badge";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import type {
  CorrectableFxPurchaseRow,
} from "@/components/forms/correct-fx-purchase-form";
import type {
  CorrectableFxSpendRow,
} from "@/components/forms/correct-fx-ledger-form";
import type { FxLedgerEntryRead } from "@/lib/banking-types";
import { formatFxNative } from "@/lib/fx-money";
import { subledgerRowClassName } from "@/lib/ledger-display";
import { fxLedgerVoidConfirmDetail } from "@/lib/ledger-void-confirm-detail";
import {
  moneyAmountClassName,
  moneyLeadingIcon,
} from "@/lib/mobile-ledger-card";
import { formatTrDate, formatTry } from "@/lib/money";

type VoidTarget = {
  journal_entry_id: string;
  description: string;
  kind: "purchase" | "ledger";
};

type Props = {
  rows: FxLedgerEntryRead[];
  currency: string;
  isMobile: boolean;
  onCorrectPurchase: (row: CorrectableFxPurchaseRow) => void;
  onCorrectSpend: (row: CorrectableFxSpendRow) => void;
  onVoid: (target: VoidTarget) => void;
};

function FxRowActions({
  row,
  currency,
  onCorrectPurchase,
  onCorrectSpend,
  onVoid,
}: {
  row: FxLedgerEntryRead;
  currency: string;
  onCorrectPurchase: (row: CorrectableFxPurchaseRow) => void;
  onCorrectSpend: (row: CorrectableFxSpendRow) => void;
  onVoid: (target: VoidTarget) => void;
}) {
  if (
    row.movement_type === "spend" &&
    row.journal_source &&
    row.journal_source !== "fx_purchase"
  ) {
    return (
      <SubledgerRowActions
        row={row}
        voidConfirmDetail={fxLedgerVoidConfirmDetail({
          movement_date: row.movement_date,
          movement_type: row.movement_type,
          native_quantity: row.native_quantity,
          currency,
          description: row.description,
        })}
        onEdit={() =>
          onCorrectSpend({
            journal_entry_id: row.journal_entry_id,
            movement_date: row.movement_date,
            movement_type: row.movement_type,
            native_quantity: row.native_quantity,
            try_cost_kurus: row.try_cost_kurus,
            description: row.description,
            journal_source: row.journal_source,
            fx_money_account_id: row.fx_money_account_id,
          })
        }
        onVoid={() =>
          onVoid({
            journal_entry_id: row.journal_entry_id,
            description: row.description,
            kind: "ledger",
          })
        }
      />
    );
  }
  if (row.movement_type === "purchase") {
    return (
      <SubledgerRowActions
        row={row}
        voidConfirmDetail={fxLedgerVoidConfirmDetail({
          movement_date: row.movement_date,
          movement_type: row.movement_type,
          native_quantity: row.native_quantity,
          currency,
          description: row.description,
        })}
        onEdit={() =>
          onCorrectPurchase({
            journal_entry_id: row.journal_entry_id,
            movement_date: row.movement_date,
            native_quantity: row.native_quantity,
            try_cost_kurus: row.try_cost_kurus,
            description: row.description,
            try_cash_money_account_id: row.try_cash_money_account_id,
          })
        }
        onVoid={() =>
          onVoid({
            journal_entry_id: row.journal_entry_id,
            description: row.description,
            kind: "purchase",
          })
        }
      />
    );
  }
  return null;
}

export function FxWalletLedgerList({
  rows,
  currency,
  isMobile,
  onCorrectPurchase,
  onCorrectSpend,
  onVoid,
}: Props) {
  if (isMobile) {
    return (
      <MobileCardList>
        {rows.map((row) => {
          // native_quantity is signed (purchase in / spend out).
          const signed = row.native_quantity;
          return (
            <MobileCardRow
              key={row.id}
              title={row.description}
              meta={
                <>
                  <span>{row.movement_type}</span>
                  <span>·</span>
                  <span>{formatTrDate(row.movement_date)}</span>
                  <span>
                    TRY {formatTry(row.try_cost_kurus)}
                  </span>
                  {row.was_corrected && <EditedBadge />}
                </>
              }
              amount={formatFxNative(Math.abs(row.native_quantity), currency)}
              amountClassName={moneyAmountClassName(signed)}
              leadingIcon={moneyLeadingIcon(signed)}
              trailing={
                <FxRowActions
                  row={row}
                  currency={currency}
                  onCorrectPurchase={onCorrectPurchase}
                  onCorrectSpend={onCorrectSpend}
                  onVoid={onVoid}
                />
              }
            />
          );
        })}
      </MobileCardList>
    );
  }

  return (
    <DataTable wide>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Date</DataTableHeaderCell>
          <DataTableHeaderCell>Type</DataTableHeaderCell>
          <DataTableHeaderCell>Description</DataTableHeaderCell>
          <DataTableHeaderCell align="right">{currency}</DataTableHeaderCell>
          <DataTableHeaderCell align="right">TRY cost</DataTableHeaderCell>
          <DataTableHeaderCell>Actions</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {rows.map((row) => (
          <DataTableRow
            key={row.id}
            className={subledgerRowClassName(row.display_kind)}
          >
            <DataTableCell>{formatTrDate(row.movement_date)}</DataTableCell>
            <DataTableCell>{row.movement_type}</DataTableCell>
            <DataTableCell>
              {row.description}
              {row.was_corrected && (
                <span className="ml-2">
                  <EditedBadge />
                </span>
              )}
            </DataTableCell>
            <DataTableCell align="right">
              {formatFxNative(Math.abs(row.native_quantity), currency)}
            </DataTableCell>
            <DataTableCell align="right">
              {formatTry(row.try_cost_kurus)}
            </DataTableCell>
            <DataTableCell align="right">
              <FxRowActions
                row={row}
                currency={currency}
                onCorrectPurchase={onCorrectPurchase}
                onCorrectSpend={onCorrectSpend}
                onVoid={onVoid}
              />
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
