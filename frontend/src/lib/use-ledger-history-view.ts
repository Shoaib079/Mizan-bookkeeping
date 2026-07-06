"use client";

import { useMemo, useState } from "react";

import {
  countHiddenLedgerHistory,
  filterLedgerRows,
  type SubledgerDisplayRow,
} from "@/lib/ledger-display";

type HistoryOptions<T extends SubledgerDisplayRow> = {
  alwaysShow?: (row: T) => boolean;
};

export function useLedgerHistoryView<T extends SubledgerDisplayRow>(
  rows: T[],
  options?: HistoryOptions<T>,
) {
  const [showHistory, setShowHistory] = useState(false);
  const hiddenCount = useMemo(
    () => countHiddenLedgerHistory(rows),
    [rows],
  );
  const visibleRows = useMemo(
    () => filterLedgerRows(rows, showHistory, options),
    [rows, showHistory, options],
  );

  return {
    showHistory,
    setShowHistory,
    hiddenCount,
    visibleRows,
    hasHiddenHistory: hiddenCount > 0,
  };
}
