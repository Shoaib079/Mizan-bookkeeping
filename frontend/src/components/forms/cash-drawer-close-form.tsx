"use client";

/** Cash drawer EOD close with over/short — Phase 9 Slice 4. */

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { CashDrawerSessionRead } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { formatTry, parseTryToKurus } from "@/lib/money";

type Props = {
  open: boolean;
  onClose: () => void;
  session: CashDrawerSessionRead;
  onClosed?: () => void;
};

export function CashDrawerCloseForm({
  open,
  onClose,
  session,
  onClosed,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const [countedText, setCountedText] = useState("");
  const [description, setDescription] = useState("Cash drawer EOD close");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const countedKurus = parseTryToKurus(countedText);
    if (countedKurus === null || countedKurus < 0) {
      setError("Enter a valid counted balance.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(
        `/entities/${entityId}/cash/drawer-sessions/${session.id}/close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            counted_balance_kurus: countedKurus,
            actor_id: actorId,
            description,
          }),
        },
      );
      onClosed?.();
      toast("Drawer closed");
      onClose();
      setCountedText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Close failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Close cash drawer" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        {session.expected_balance_kurus !== null && (
          <p className="text-sm text-muted-foreground">
            Expected balance: {formatTry(session.expected_balance_kurus)}
          </p>
        )}
        <div>
          <Label htmlFor="counted">Counted balance (TRY)</Label>
          <Input
            id="counted"
            placeholder="2.350,00"
            value={countedText}
            onChange={(e) => setCountedText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="close-desc">Description</Label>
          <Input
            id="close-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Over/short posts to account 5400 automatically.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Closing…" : "Close drawer"}
        </Button>
      </form>
    </Dialog>
  );
}
