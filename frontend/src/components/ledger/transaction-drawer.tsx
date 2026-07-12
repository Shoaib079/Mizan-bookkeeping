"use client";

/** Global transaction drawer (audit C1) — one peek surface for any journal
 * entry, opened from any row on any page via useTransactionPeek().
 *
 * Void policy (accounting-safe): only GENERIC_CORRECTABLE_SOURCES may void
 * through the generic ledger endpoint. Subledger-backed sources get an
 * "Open in <flow>" link to their dedicated correction flow instead. */

import Link from "next/link";
import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { VoidTriggerButton } from "@/components/ledger/void-trigger-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useEntity } from "@/lib/entity-context";
import { LEDGER_CHANGED_EVENT, emitLedgerChanged } from "@/lib/ledger-events";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  GENERIC_CORRECTABLE_SOURCES,
  genericVoidPath,
  ledgerEntryHref,
  sourceFlow,
  sourceLabel,
} from "@/lib/transaction-registry";

export { LEDGER_CHANGED_EVENT };

export type PeekEntryLine = {
  amount_kurus: number;
  side: "debit" | "credit";
  account_label?: string;
};

export type PeekEntry = {
  id: string;
  entry_date: string;
  description: string;
  source: string;
  status?: string;
  lines?: PeekEntryLine[];
  reverses_entry_id?: string | null;
  reversed_by_entry_id?: string | null;
  amends_entry_id?: string | null;
  amended_by_entry_id?: string | null;
};

type PeekContextValue = {
  openTransaction: (entry: PeekEntry) => void;
};

const PeekContext = createContext<PeekContextValue | null>(null);

export function useTransactionPeek(): PeekContextValue {
  const ctx = useContext(PeekContext);
  if (!ctx) {
    throw new Error("useTransactionPeek must be used within TransactionPeekProvider");
  }
  return ctx;
}

function debitTotalKurus(lines: PeekEntryLine[]): number {
  return lines.reduce(
    (sum, line) => sum + (line.side === "debit" ? line.amount_kurus : 0),
    0,
  );
}

export function TransactionPeekProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { entityId } = useEntity();
  const [entry, setEntry] = useState<PeekEntry | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);

  const openTransaction = useCallback((next: PeekEntry) => {
    setEntry(next);
    setVoidOpen(false);
  }, []);

  const close = useCallback(() => {
    setEntry(null);
    setVoidOpen(false);
  }, []);

  useEffect(() => {
    if (!entry) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entry, close]);

  const value = useMemo(() => ({ openTransaction }), [openTransaction]);

  const flow = entry ? sourceFlow(entry.source) : null;
  const canVoidHere =
    entry !== null &&
    entry.status === "posted" &&
    GENERIC_CORRECTABLE_SOURCES.has(entry.source) &&
    Boolean(entityId);
  const chainLinks = entry
    ? ([
        entry.reverses_entry_id && { label: "Reverses", id: entry.reverses_entry_id },
        entry.reversed_by_entry_id && {
          label: "Reversed by",
          id: entry.reversed_by_entry_id,
        },
        entry.amends_entry_id && { label: "Amends", id: entry.amends_entry_id },
        entry.amended_by_entry_id && {
          label: "Amended by",
          id: entry.amended_by_entry_id,
        },
      ].filter(Boolean) as { label: string; id: string }[])
    : [];

  return (
    <PeekContext.Provider value={value}>
      {children}

      {entry && (
        <>
          <button
            type="button"
            aria-label="Close transaction details"
            className="fixed inset-0 z-40 bg-black/30"
            onClick={close}
          />
          <aside
            role="dialog"
            aria-label="Transaction details"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-xl"
          >
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Transaction · {sourceLabel(entry.source)}</span>
                <button
                  type="button"
                  aria-label="Close"
                  className="rounded p-1 hover:text-foreground"
                  onClick={close}
                >
                  <X className="size-4" />
                </button>
              </div>
              {entry.lines && entry.lines.length > 0 && (
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {formatTry(debitTotalKurus(entry.lines))}
                </p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                {entry.description} · {formatTrDate(entry.entry_date)}
              </p>
              {entry.status && (
                <div className="mt-2">
                  <StatusBadge status={entry.status} />
                </div>
              )}
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {entry.lines && entry.lines.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Journal lines
                  </h3>
                  <div className="overflow-hidden rounded-md border border-border text-sm">
                    {entry.lines.map((line, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between border-b border-border px-3 py-2 last:border-b-0"
                      >
                        <span className="min-w-0 truncate">
                          {line.account_label ?? (line.side === "debit" ? "Debit" : "Credit")}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {line.side === "debit" ? "D" : "C"}{" "}
                          {formatTry(line.amount_kurus)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {chainLinks.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Correction chain
                  </h3>
                  <div className="space-y-1">
                    {chainLinks.map((link) => (
                      <Link
                        key={`${link.label}-${link.id}`}
                        href={ledgerEntryHref(link.id)}
                        className="block text-sm text-primary hover:underline"
                        onClick={close}
                      >
                        {link.label}: {link.id.slice(0, 8)}…
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Connected
                </h3>
                <div className="space-y-1 text-sm">
                  <Link
                    href={ledgerEntryHref(entry.id)}
                    className="block text-primary hover:underline"
                    onClick={close}
                  >
                    View in general ledger
                  </Link>
                  {flow && (
                    <Link
                      href={flow.href}
                      className="block text-primary hover:underline"
                      onClick={close}
                    >
                      Open in {flow.label}
                    </Link>
                  )}
                </div>
              </section>

              {!canVoidHere && flow && entry.status === "posted" && (
                <p className="text-xs text-muted-foreground">
                  Edit or void this entry from {flow.label} — it updates its own
                  subledger, so corrections go through that flow.
                </p>
              )}
            </div>

            {canVoidHere && (
              <div className="border-t border-border px-5 py-3">
                <VoidTriggerButton onContinue={() => setVoidOpen(true)} />
              </div>
            )}
          </aside>

          <VoidSubledgerDialog
            open={voidOpen}
            description={entry.description}
            voidPath={
              entityId && canVoidHere ? genericVoidPath(entityId, entry.id) : null
            }
            onClose={() => setVoidOpen(false)}
            onSaved={() => {
              setVoidOpen(false);
              close();
              emitLedgerChanged();
            }}
          />
        </>
      )}
    </PeekContext.Provider>
  );
}
