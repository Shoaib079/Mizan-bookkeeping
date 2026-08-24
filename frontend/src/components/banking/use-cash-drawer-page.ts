"use client";

/** State, loaders, rename, and reopen for CashDrawerPage. */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import type {
  CashDrawerSessionDetail,
  CashDrawerSessionRead,
  MoneyAccountLeaf,
  MoneyAccountTree,
} from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { useToast } from "@/lib/toast";
import { newIdempotencyKey } from "@/lib/use-submit-idempotency";
import { useWriteChrome } from "@/lib/use-write-chrome";

export function useCashDrawerPage() {
  const { entityId, actorId } = useEntity();
  const { showWrite: showOpsWrite, showCountCash, showCloseDay } =
    useWriteChrome();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<CashDrawerSessionRead[]>([]);
  /** Closed counts only — an open session has nothing counted yet. */
  const countHistory = useMemo(
    () => sessions.filter((s) => s.status === "closed"),
    [sessions],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CashDrawerSessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movementOpen, setMovementOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [countCashOpen, setCountCashOpen] = useState(false);
  const [closeDayOpen, setCloseDayOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const [cashAccounts, setCashAccounts] = useState<MoneyAccountLeaf[]>([]);
  const [addDrawerOpen, setAddDrawerOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  const reloadCashAccounts = useCallback(async () => {
    if (!entityId) {
      setCashAccounts([]);
      return;
    }
    try {
      const tree = await apiFetch<MoneyAccountTree>(
        `/entities/${entityId}/banking/accounts/tree`,
      );
      setCashAccounts(tree.cash.accounts.filter((a) => a.is_active));
    } catch {
      setCashAccounts([]);
    }
  }, [entityId]);

  const reloadSessions = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ items: CashDrawerSessionRead[] }>(
        `/entities/${entityId}/cash/drawer-sessions?limit=50`,
      );
      setSessions(res.items);
      setSelectedId((prev) => prev ?? res.items[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  const reloadDetail = useCallback(async () => {
    if (!entityId || !selectedId) {
      setDetail(null);
      return;
    }
    try {
      const data = await apiFetch<CashDrawerSessionDetail>(
        `/entities/${entityId}/cash/drawer-sessions/${selectedId}`,
      );
      setDetail(data);
    } catch {
      setDetail(null);
    }
  }, [entityId, selectedId]);

  useEffect(() => {
    void reloadCashAccounts();
  }, [reloadCashAccounts]);

  useEffect(() => {
    void reloadSessions();
  }, [reloadSessions]);

  useEffect(() => {
    void reloadDetail();
  }, [reloadDetail]);

  function onSaved() {
    void reloadSessions();
    void reloadDetail();
    void reloadCashAccounts();
  }

  function startRename(account: MoneyAccountLeaf) {
    setRenamingId(account.id);
    setRenameText(account.name);
    setRenameError(null);
  }

  function cancelRename() {
    setRenamingId(null);
  }

  async function saveRename(accountId: string) {
    if (!entityId) return;
    const name = renameText.trim();
    if (!name) {
      setRenameError("Name is required.");
      return;
    }
    setRenaming(true);
    setRenameError(null);
    try {
      await apiFetch(`/entities/${entityId}/banking/accounts/${accountId}`, {
        method: "PATCH",
        idempotencyKey: newIdempotencyKey(),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setRenamingId(null);
      toast("Drawer renamed");
      void reloadCashAccounts();
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setRenaming(false);
    }
  }

  function openReopenDialog() {
    setReopenReason("");
    setReopenError(null);
    setReopenOpen(true);
  }

  async function onReopenSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !detail) return;
    const reason = reopenReason.trim();
    if (!reason) return;
    setReopening(true);
    setReopenError(null);
    try {
      await apiFetch(
        `/entities/${entityId}/cash/drawer-sessions/${detail.id}/reopen`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          idempotencyKey: newIdempotencyKey(),
          body: JSON.stringify({
            reason,
            actor_id: actorId,
          }),
        },
      );
      setReopenOpen(false);
      setReopenReason("");
      onSaved();
    } catch (err) {
      setReopenError(err instanceof Error ? err.message : "Reopen failed");
    } finally {
      setReopening(false);
    }
  }

  return {
    entityId,
    showOpsWrite,
    showCountCash,
    showCloseDay,
    sessions,
    countHistory,
    selectedId,
    setSelectedId,
    detail,
    loading,
    error,
    cashAccounts,
    renamingId,
    renameText,
    setRenameText,
    renameError,
    renaming,
    startRename,
    cancelRename,
    saveRename,
    movementOpen,
    setMovementOpen,
    closeOpen,
    setCloseOpen,
    countCashOpen,
    setCountCashOpen,
    closeDayOpen,
    setCloseDayOpen,
    reopenOpen,
    setReopenOpen,
    reopenReason,
    setReopenReason,
    reopenError,
    reopening,
    openReopenDialog,
    onReopenSubmit,
    addDrawerOpen,
    setAddDrawerOpen,
    onSaved,
    reloadCashAccounts,
  };
}
