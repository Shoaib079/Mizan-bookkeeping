"use client";

import Link from "next/link";

import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { formatTry } from "@/lib/money";
import { generalLedgerEntryActions } from "@/lib/subledger-actions";
import {
  ledgerRowSourceLabel,
  sourceFlow,
} from "@/lib/transaction-registry";

export type JournalEntryLine = {
  id: string;
  account_id: string;
  amount_kurus: number;
  side: "debit" | "credit";
  line_number: number;
};

export type JournalEntryRow = {
  id: string;
  entry_date: string;
  description: string;
  status: string;
  source: string;
  reverses_entry_id: string | null;
  reversed_by_entry_id: string | null;
  amends_entry_id: string | null;
  amended_by_entry_id: string | null;
  lines: JournalEntryLine[];
};

function ChainLink({
  label,
  entryId,
  onNavigate,
}: {
  label: string;
  entryId: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="font-mono text-xs text-primary hover:underline"
      onClick={() => onNavigate(entryId)}
    >
      {label}: {entryId.slice(0, 8)}…
    </button>
  );
}

/** Expanded GL row detail — split from general-ledger-panel (S9). */
export function EntryDetailPanel({
  row,
  accountLabel,
  onNavigateEntry,
}: {
  row: JournalEntryRow;
  accountLabel: (id: string) => string;
  onNavigateEntry: (id: string) => void;
}) {
  const chainLinks = [
    row.reverses_entry_id && {
      label: "Reverses",
      id: row.reverses_entry_id,
    },
    row.reversed_by_entry_id && {
      label: "Reversed by",
      id: row.reversed_by_entry_id,
    },
    row.amends_entry_id && {
      label: "Amends",
      id: row.amends_entry_id,
    },
    row.amended_by_entry_id && {
      label: "Amended by",
      id: row.amended_by_entry_id,
    },
  ].filter(Boolean) as { label: string; id: string }[];

  return (
    <div className="space-y-4 border-t border-border bg-muted/20 px-4 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Entry ID: <span className="font-mono">{row.id}</span>
        </span>
        <span>
          Source: {ledgerRowSourceLabel(row.source, row.reverses_entry_id)}
        </span>
      </div>

      {chainLinks.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {chainLinks.map((link) => (
            <ChainLink
              key={`${link.label}-${link.id}`}
              label={link.label}
              entryId={link.id}
              onNavigate={onNavigateEntry}
            />
          ))}
        </div>
      )}

      <DataTable wide>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Account</DataTableHeaderCell>
            <DataTableHeaderCell>Side</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {row.lines.map((line) => (
            <DataTableRow key={line.id}>
              <DataTableCell>{accountLabel(line.account_id)}</DataTableCell>
              <DataTableCell className="capitalize">{line.side}</DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {formatTry(line.amount_kurus)}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {(() => {
        const flow = sourceFlow(row.source);
        const glActions = generalLedgerEntryActions(row.source);
        if (!flow || glActions.useGenericEndpoints) return null;
        return (
          <p className="text-xs text-muted-foreground">
            This entry is managed by its own flow — edit or void it in{" "}
            <Link href={flow.href} className="text-primary hover:underline">
              {flow.label}
            </Link>
            .
          </p>
        );
      })()}
    </div>
  );
}
