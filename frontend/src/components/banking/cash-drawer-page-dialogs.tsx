"use client";

/** Cash page dialogs — movement, count, close, reopen, add drawer. */

import type { FormEvent } from "react";

import { CashCountForm } from "@/components/forms/cash-count-form";
import { CashDrawerCloseDayForm } from "@/components/forms/cash-drawer-close-day-form";
import { CashDrawerCloseForm } from "@/components/forms/cash-drawer-close-form";
import { CashMovementForm } from "@/components/forms/cash-movement-form";
import { MoneyAccountForm } from "@/components/forms/money-account-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import type { CashDrawerSessionDetail } from "@/lib/banking-types";

export type CashDrawerPageDialogsProps = {
  detail: CashDrawerSessionDetail | null;
  movementOpen: boolean;
  onMovementClose: () => void;
  countCashOpen: boolean;
  onCountCashClose: () => void;
  onContinueToCloseDay: () => void;
  closeDayOpen: boolean;
  onCloseDayClose: () => void;
  closeOpen: boolean;
  onCloseDrawerClose: () => void;
  reopenOpen: boolean;
  onReopenClose: () => void;
  reopenReason: string;
  onReopenReasonChange: (value: string) => void;
  reopenError: string | null;
  reopening: boolean;
  onReopenSubmit: (event: FormEvent) => void;
  addDrawerOpen: boolean;
  onAddDrawerClose: () => void;
  onSaved: () => void;
  onCashAccountsReload: () => void;
};

export function CashDrawerPageDialogs({
  detail,
  movementOpen,
  onMovementClose,
  countCashOpen,
  onCountCashClose,
  onContinueToCloseDay,
  closeDayOpen,
  onCloseDayClose,
  closeOpen,
  onCloseDrawerClose,
  reopenOpen,
  onReopenClose,
  reopenReason,
  onReopenReasonChange,
  reopenError,
  reopening,
  onReopenSubmit,
  addDrawerOpen,
  onAddDrawerClose,
  onSaved,
  onCashAccountsReload,
}: CashDrawerPageDialogsProps) {
  return (
    <>
      <CashMovementForm
        open={movementOpen}
        onClose={onMovementClose}
        defaultCashAccountId={detail?.money_account_id}
        onSaved={onSaved}
      />
      <CashCountForm
        open={countCashOpen}
        onClose={onCountCashClose}
        defaultCashAccountId={detail?.money_account_id}
        defaultSessionDate={detail?.session_date}
        onContinueToCloseDay={onContinueToCloseDay}
      />
      <CashDrawerCloseDayForm
        open={closeDayOpen}
        onClose={onCloseDayClose}
        defaultCashAccountId={detail?.money_account_id}
        defaultSessionDate={detail?.session_date}
        onClosed={onSaved}
      />
      {detail && detail.status === "open" && (
        <CashDrawerCloseForm
          open={closeOpen}
          onClose={onCloseDrawerClose}
          session={detail}
          onClosed={onSaved}
        />
      )}

      <Dialog
        open={reopenOpen}
        title="Reopen closed drawer day"
        onClose={onReopenClose}
      >
        <form onSubmit={onReopenSubmit} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Owner only. Reopening is audited — provide a reason, same as period
            unlock.
          </p>
          <div>
            <Label htmlFor="drawer-reopen-reason">Reason</Label>
            <Input
              id="drawer-reopen-reason"
              value={reopenReason}
              onChange={(e) => onReopenReasonChange(e.target.value)}
              placeholder="Why reopen this drawer day?"
              required
              autoFocus
            />
          </div>
          {reopenError && (
            <p className="text-sm text-destructive">{reopenError}</p>
          )}
          <Button type="submit" disabled={reopening || !reopenReason.trim()}>
            {reopening ? "Reopening…" : "Reopen drawer day"}
          </Button>
        </form>
      </Dialog>

      <MoneyAccountForm
        open={addDrawerOpen}
        onClose={onAddDrawerClose}
        defaultKind="cash"
        fixedKind="cash"
        onSaved={onCashAccountsReload}
      />
    </>
  );
}
