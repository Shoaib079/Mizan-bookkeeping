"use client";

/** Cash drawer sessions, movements, EOD close — Phase 9 Slice 4 / 11.13 optional session. */

import Link from "next/link";
import { Wallet } from "lucide-react";

import { cashPageWriteHeader } from "@/components/banking/cash-page-write-actions";
import { CashDrawerPageDialogs } from "@/components/banking/cash-drawer-page-dialogs";
import { CashDrawerSessionsPanel } from "@/components/banking/cash-drawer-sessions-panel";
import { CashDrawersList } from "@/components/banking/cash-drawers-list";
import { useCashDrawerPage } from "@/components/banking/use-cash-drawer-page";
import { PageHeader } from "@/components/page/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";

export default function CashDrawerPage() {
  const s = useCashDrawerPage();

  return (
    <>
      <PageHeader
        title="Cash"
        {...cashPageWriteHeader({
          entityId: s.entityId,
          showOpsWrite: s.showOpsWrite,
          showCountCash: s.showCountCash,
          showCloseDay: s.showCloseDay,
          onMovement: () => s.setMovementOpen(true),
          onCountCash: () => s.setCountCashOpen(true),
          onCloseDay: () => s.setCloseDayOpen(true),
          onAddDrawer: () => s.setAddDrawerOpen(true),
        })}
      />

      {!s.entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}
      {s.error && <p className="mb-4 text-sm text-destructive">{s.error}</p>}

      {s.entityId && (
        <CashDrawersList
          cashAccounts={s.cashAccounts}
          renamingId={s.renamingId}
          renameText={s.renameText}
          renameError={s.renameError}
          renaming={s.renaming}
          onRenameTextChange={s.setRenameText}
          onStartRename={s.startRename}
          onCancelRename={s.cancelRename}
          onSaveRename={s.saveRename}
        />
      )}

      {s.loading && <TableSkeleton columns={2} rows={4} />}

      <CashDrawerSessionsPanel
        sessions={s.sessions}
        selectedId={s.selectedId}
        onSelect={s.setSelectedId}
        detail={s.detail}
        showOpsWrite={s.showOpsWrite}
        onOpenReopen={s.openReopenDialog}
        onCloseDrawer={() => s.setCloseOpen(true)}
      />

      {s.countHistory.length > 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Looking for the over/short pattern across days?{" "}
          <Link href="/reports/cash-book" className="text-primary hover:underline">
            Cash book
          </Link>{" "}
          has the full count history next to what should be in the drawer.
        </p>
      )}

      {!s.loading && s.entityId && s.sessions.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="No drawer sessions yet"
          hint="Record cash movements anytime. Count cash to prepare a till total; Close day to post over/short and lock."
        />
      )}

      <CashDrawerPageDialogs
        detail={s.detail}
        movementOpen={s.movementOpen}
        onMovementClose={() => s.setMovementOpen(false)}
        countCashOpen={s.countCashOpen}
        onCountCashClose={() => s.setCountCashOpen(false)}
        onContinueToCloseDay={() => {
          s.setCountCashOpen(false);
          s.setCloseDayOpen(true);
        }}
        closeDayOpen={s.closeDayOpen}
        onCloseDayClose={() => s.setCloseDayOpen(false)}
        closeOpen={s.closeOpen}
        onCloseDrawerClose={() => s.setCloseOpen(false)}
        reopenOpen={s.reopenOpen}
        onReopenClose={() => s.setReopenOpen(false)}
        reopenReason={s.reopenReason}
        onReopenReasonChange={s.setReopenReason}
        reopenError={s.reopenError}
        reopening={s.reopening}
        onReopenSubmit={s.onReopenSubmit}
        addDrawerOpen={s.addDrawerOpen}
        onAddDrawerClose={() => s.setAddDrawerOpen(false)}
        onSaved={s.onSaved}
        onCashAccountsReload={() => void s.reloadCashAccounts()}
      />
    </>
  );
}
