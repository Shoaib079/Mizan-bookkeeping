"use client";

/** Row actions for any subledger table.
 *
 * These live in a trailing "Actions" column on every ledger, never inside the
 * description cell — a button whose left edge moves with the length of the text
 * beside it can't be scanned down a column, and the description cell already
 * carries badges and split notes.
 *
 * Edit is deliberately quiet. It used to render filled-primary on every row,
 * which turned a twenty-row ledger into a wall of blue and made Edit look more
 * important than the figures. Edit and Void are siblings and are weighted alike;
 * Void keeps only its destructive colour.
 */

import { Button } from "@/components/ui/button";
import {
  canEditSubledgerRow,
  type SubledgerDisplayRow,
} from "@/lib/ledger-display";

import { VoidTriggerButton } from "./void-trigger-button";

type Props = {
  row: SubledgerDisplayRow & { journal_entry_id?: string | null };
  onEdit: () => void;
  onVoid: () => void;
  /** When false, only Void is shown (e.g. advance_applied companion rows). */
  showEdit?: boolean;
};

export function SubledgerRowActions({
  row,
  onEdit,
  onVoid,
  showEdit = true,
}: Props) {
  if (!canEditSubledgerRow(row)) return null;
  return (
    <div className="flex items-center justify-end gap-0.5">
      {showEdit && (
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2 text-muted-foreground hover:text-foreground"
          onClick={onEdit}
        >
          Edit
        </Button>
      )}
      <VoidTriggerButton onContinue={onVoid} />
    </div>
  );
}
