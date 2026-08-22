"use client";

import { useCallback, useState } from "react";

import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import {
  GlEditDialogs,
  type GlEditTarget,
} from "@/components/ledger/gl-edit-dialogs";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import { apiFetch, entityPath } from "@/lib/api";
import { editTargetFor } from "@/lib/gl-edit-target";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { useToast } from "@/lib/toast";
import {
  canUseGenericLedgerCorrect,
  generalLedgerEntryActions,
  journalEntryRowActions,
} from "@/lib/subledger-actions";
import { ledgerRowSourceLabel } from "@/lib/transaction-registry";
import { formatVoidConfirmDetail } from "@/lib/void-confirm-summary";

export type GlEntryActionsRow = {
  id: string;
  entry_date: string;
  description: string;
  source: string;
  status: string;
  reverses_entry_id?: string | null;
  /** When present, debit sum feeds void confirm detail. */
  lines?: { side: string; amount_kurus: number }[];
  /** Override display total for void confirmation. */
  amount_kurus?: number;
};

function glEntryDisplayTotal(row: GlEntryActionsRow): number | undefined {
  if (row.amount_kurus != null) return row.amount_kurus;
  if (!row.lines?.length) return undefined;
  return row.lines.reduce(
    (sum, line) => sum + (line.side === "debit" ? line.amount_kurus : 0),
    0,
  );
}

type LedgerEntryActionsResponse = {
  can_edit: boolean;
  can_void: boolean;
  void_path: string | null;
  edit: { kind: string; context: Record<string, unknown> } | null;
};

type Props = {
  row: GlEntryActionsRow;
  onGenericEdit: () => void;
  onSaved: () => void;
};

export function GlEntryActions({ row, onGenericEdit, onSaved }: Props) {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidPath, setVoidPath] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<GlEditTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = generalLedgerEntryActions(row.source);
  const actions = journalEntryRowActions(row.source);

  const loadActions = useCallback(async (): Promise<LedgerEntryActionsResponse> => {
    if (!entityId) {
      throw new Error("No entity selected");
    }
    if (preview.useGenericEndpoints) {
      return {
        can_edit: canUseGenericLedgerCorrect(row.source),
        can_void: true,
        void_path: `ledger/entries/${row.id}/void`,
        edit: preview.canEdit
          ? { kind: "generic_ledger", context: {} }
          : null,
      };
    }
    return apiFetch<LedgerEntryActionsResponse>(
      `/entities/${entityId}/ledger/entries/${row.id}/actions`,
    );
  }, [entityId, preview.canEdit, preview.useGenericEndpoints, row.id, row.source]);

  async function startVoid() {
    setBusy(true);
    try {
      const actions = await loadActions();
      if (!actions.can_void || !actions.void_path || !entityId) return;
      setVoidPath(entityPath(entityId, actions.void_path));
      setVoidOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function startEdit() {
    setBusy(true);
    try {
      const actions = await loadActions();
      if (!actions.can_edit || !actions.edit) return;
      const ctx = actions.edit.context;
      if (actions.edit.kind === "generic_ledger") {
        onGenericEdit();
        return;
      }
      const target = editTargetFor(actions.edit.kind, ctx, row.id);
      if (!target) {
        // Loud, not silent. The arm this replaces was `default: return`, which
        // is how Edit came to render on supplier invoices and do nothing at
        // all when pressed — the backend offered a kind the switch had no case
        // for, and `return` swallowed it. A button that does nothing is worse
        // than no button: it reads as the app being broken, with nothing to
        // report.
        toast(
          `Editing is not available here for this entry (${actions.edit.kind}). ` +
            "Open it from its own page.",
          "warning",
        );
        return;
      }
      setEditTarget(target);
    } finally {
      setBusy(false);
    }
  }

  if (row.status !== "posted") return null;
  if (!actions.canEdit && !actions.canVoid) return null;

  const voidConfirmDetail = formatVoidConfirmDetail({
    date: formatTrDate(row.entry_date),
    type: ledgerRowSourceLabel(row.source, row.reverses_entry_id),
    amount: (() => {
      const total = glEntryDisplayTotal(row);
      return total != null ? formatTry(total) : undefined;
    })(),
    description: row.description,
  });

  return (
    <>
      <SubledgerRowActions
        row={{ display_kind: "effective", journal_entry_id: row.id }}
        showEdit={actions.canEdit}
        voidConfirmDetail={voidConfirmDetail}
        onEdit={() => void startEdit()}
        onVoid={() => void startVoid()}
      />
      {busy && (
        <span className="ml-1 text-xs text-muted-foreground">…</span>
      )}
      <VoidSubledgerDialog
        open={voidOpen}
        title="Void ledger entry"
        description={row.description}
        voidPath={voidPath}
        onClose={() => {
          setVoidOpen(false);
          setVoidPath(null);
        }}
        onSaved={() => {
          setVoidOpen(false);
          setVoidPath(null);
          onSaved();
        }}
      />
      <GlEditDialogs
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null);
          onSaved();
        }}
      />
    </>
  );
}
