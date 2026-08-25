"use client";

/** State and loaders for PeopleRecordDialog. */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  LEDGER_PATH,
  LIST_PATH,
  mapPersonRow,
  NEEDS_REIMBURSEMENT_BALANCE,
  STAFF_DATE_ACTIONS,
  type LedgerBalance,
  type PersonPickerResult,
} from "@/components/record/people-record-dialog-helpers";
import { apiFetch } from "@/lib/api";
import { todayTrDate } from "@/lib/dates";
import { useEntity } from "@/lib/entity-context";
import { extractPartnerBalanceKurus } from "@/lib/partner-balance";
import { parseTrDate } from "@/lib/money";
import type { PersonPickerKind, RecordActionKey } from "@/lib/record-actions";

export function usePeopleRecordDialog(opts: {
  open: boolean;
  action: RecordActionKey;
  kind: PersonPickerKind;
  onClose: () => void;
}) {
  const { open, action, kind, onClose } = opts;
  const { entityId } = useEntity();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<PersonPickerResult[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [balanceKurus, setBalanceKurus] = useState<number | undefined>(
    undefined,
  );
  const [netBalanceKurus, setNetBalanceKurus] = useState<number | undefined>(
    undefined,
  );
  const [capitalBalanceKurus, setCapitalBalanceKurus] = useState<
    number | undefined
  >(undefined);
  const [unpaidProfitKurus, setUnpaidProfitKurus] = useState<number | undefined>(
    undefined,
  );
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [dateText, setDateText] = useState("");

  const showStaffDate = kind === "staff" && STAFF_DATE_ACTIONS.has(action);
  const paymentDateIso = parseTrDate(dateText) ?? undefined;

  const reset = useCallback(() => {
    setItems([]);
    setSelectedId("");
    setLoadError(null);
    setLoading(false);
    setBalanceKurus(undefined);
    setNetBalanceKurus(undefined);
    setCapitalBalanceKurus(undefined);
    setUnpaidProfitKurus(undefined);
    setBalanceLoading(false);
    setBalanceError(null);
    setDateText("");
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    if (!entityId) return;

    setDateText(todayTrDate());
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void apiFetch<{ items: unknown[] }>(
      `/entities/${entityId}${LIST_PATH[kind]}?limit=100`,
    )
      .then((res) => {
        if (cancelled) return;
        const mapped = res.items.map((row) => mapPersonRow(kind, row));
        setItems(mapped);
        if (mapped[0]) setSelectedId(mapped[0].id);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load list");
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, entityId, kind, reset]);

  useEffect(() => {
    if (!open || !entityId || !selectedId) {
      setBalanceKurus(undefined);
      setNetBalanceKurus(undefined);
      setCapitalBalanceKurus(undefined);
      setUnpaidProfitKurus(undefined);
      setBalanceError(null);
      setBalanceLoading(false);
      return;
    }
    if (!NEEDS_REIMBURSEMENT_BALANCE.has(action)) {
      setBalanceKurus(undefined);
      setNetBalanceKurus(undefined);
      setCapitalBalanceKurus(undefined);
      setUnpaidProfitKurus(undefined);
      setBalanceError(null);
      setBalanceLoading(false);
      return;
    }

    let cancelled = false;
    setBalanceLoading(true);
    setBalanceError(null);

    const ledgerPath = LEDGER_PATH[kind]?.(selectedId);
    if (!ledgerPath) {
      setBalanceLoading(false);
      return;
    }

    void apiFetch<LedgerBalance>(`/entities/${entityId}${ledgerPath}`)
      .then((ledger) => {
        if (cancelled) return;
        setBalanceKurus(ledger.balance_kurus);
        setNetBalanceKurus(extractPartnerBalanceKurus(ledger));
        setCapitalBalanceKurus(ledger.capital_balance_kurus ?? 0);
        setUnpaidProfitKurus(ledger.unpaid_profit_kurus ?? 0);
      })
      .catch((err) => {
        if (cancelled) return;
        setBalanceError(
          err instanceof Error ? err.message : "Failed to load balance",
        );
        setBalanceKurus(undefined);
        setNetBalanceKurus(undefined);
        setCapitalBalanceKurus(undefined);
        setUnpaidProfitKurus(undefined);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, entityId, kind, action, selectedId]);

  const options = useMemo(
    () => items.map((item) => ({ value: item.id, label: item.name })),
    [items],
  );

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const needsReimbursementBalance = NEEDS_REIMBURSEMENT_BALANCE.has(action);
  const formReady =
    Boolean(selected) &&
    (!needsReimbursementBalance || (!balanceLoading && !balanceError));

  function handleClose() {
    reset();
    onClose();
  }

  return {
    entityId,
    loading,
    loadError,
    items,
    selectedId,
    setSelectedId,
    balanceKurus,
    balanceLoading,
    balanceError,
    dateText,
    setDateText,
    showStaffDate,
    paymentDateIso,
    options,
    selected,
    formReady,
    handleClose,
  };
}
