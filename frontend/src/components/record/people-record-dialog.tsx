"use client";

/** Record hub people actions — pick person and enter fields in one dialog. */

import {
  kindLabel,
  pickerLabel,
} from "@/components/record/people-record-dialog-helpers";
import { renderEmbeddedForm } from "@/components/record/people-record-embedded-form";
import { usePeopleRecordDialog } from "@/components/record/use-people-record-dialog";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import type { PersonPickerKind, RecordActionKey } from "@/lib/record-actions";

export type { PersonPickerResult } from "@/components/record/people-record-dialog-helpers";

type Props = {
  open: boolean;
  action: RecordActionKey;
  title: string;
  kind: PersonPickerKind;
  onClose: () => void;
};

export function PeopleRecordDialog({
  open,
  action,
  title,
  kind,
  onClose,
}: Props) {
  const page = usePeopleRecordDialog({ open, action, kind, onClose });

  return (
    <Dialog open={open} title={title} size="compact" onClose={page.handleClose}>
      {!page.entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar first.
        </p>
      )}

      {page.entityId && page.loading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {page.entityId && !page.loading && page.loadError && (
        <p className="text-sm text-destructive">{page.loadError}</p>
      )}

      {page.entityId && !page.loading && !page.loadError && page.items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No {kindLabel(kind)} found — add one from the directory first.
        </p>
      )}

      {page.entityId && !page.loading && page.items.length > 0 && (
        <div className="space-y-3">
          {page.showStaffDate && (
            <div>
              <Label htmlFor="people-record-date">Date (DD.MM.YYYY)</Label>
              <DateInput
                id="people-record-date"
                value={page.dateText}
                onChange={page.setDateText}
                required
              />
            </div>
          )}
          <div>
            <Label>{pickerLabel(kind)}</Label>
            <Combobox
              value={page.selectedId}
              onValueChange={page.setSelectedId}
              options={page.options}
              placeholder={`Choose ${kindLabel(kind)}…`}
            />
          </div>

          {page.balanceLoading && (
            <p className="text-sm text-muted-foreground">Loading balance…</p>
          )}
          {page.balanceError && (
            <p className="text-sm text-destructive">{page.balanceError}</p>
          )}

          {page.formReady && page.selected && (
            <div className="border-t border-border pt-3">
              {renderEmbeddedForm(
                action,
                page.selected,
                page.balanceKurus,
                page.entityId,
                page.handleClose,
                page.paymentDateIso,
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
