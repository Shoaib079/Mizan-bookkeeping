"use client";

/** The trailing cell of a subledger row: the buttons, or why there are none.
 *
 * Three rules used to sit loose in each page that drew one, and the partner
 * page got all three wrong at once — which is what produced "i do not see any
 * action button edit or void on partner page":
 *
 *  - An entry shared by several owners must offer nothing, because voiding
 *    from one person's row reverses everyone's. It drew an empty cell, which
 *    reads as broken rather than as a rule.
 *  - Edit belongs only to kinds this page can actually open. The backend names
 *    the kind; the page opened its own form regardless, so a profit allocation
 *    on a single-partner book drew an Edit that failed on submit.
 *  - Void goes to the path the backend returned, not one rebuilt from the ids
 *    the page happens to hold. Those agree for a drawing and do not for an
 *    allocation.
 *
 * Kept together because they are one decision — what this row may offer — and
 * splitting them across a page is how they drifted apart in the first place.
 */

import { Button } from "@/components/ui/button";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import { type SubledgerDisplayRow } from "@/lib/ledger-display";
import {
  actionsForOneOwnersRow,
  type EntryActions,
} from "@/lib/use-entry-actions";

type Props = {
  row: SubledgerDisplayRow & { journal_entry_id?: string | null };
  /** As the backend answered — before the shared-entry rule is applied. */
  actions: EntryActions;
  /** `edit.kind` values this page has a form for. Anything else gets no Edit. */
  opensEditKinds: readonly string[];
  /** Plural, lowercase — "partners", "employees". Whose rows these are. */
  ownerNoun?: string;
  onEdit: () => void;
  /** Given the backend's own `void_path`, relative to the entity. */
  onVoid: (voidPath: string) => void;
};

export function SubledgerActionsCell({
  row,
  actions,
  opensEditKinds,
  ownerNoun = "people",
  onEdit,
  onVoid,
}: Props) {
  const allowed = actionsForOneOwnersRow(actions);
  const canEdit =
    allowed.can_edit && opensEditKinds.includes(allowed.edit?.kind ?? "");
  const canVoid = allowed.can_void && allowed.void_path !== null;

  if (canEdit || canVoid) {
    return (
      <SubledgerRowActions
        row={row}
        showEdit={canEdit}
        onEdit={onEdit}
        onVoid={() => allowed.void_path && onVoid(allowed.void_path)}
      />
    );
  }

  if (actions.owner_count > 1) {
    return (
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          disabled
          className="h-8 cursor-help px-2 text-xs font-normal text-muted-foreground disabled:opacity-100"
          title={
            `This entry covers ${actions.owner_count} ${ownerNoun}. Changing ` +
            "it here would affect all of them, so edit or void it from the " +
            "General ledger, where the whole entry is shown."
          }
        >
          Shared
        </Button>
      </div>
    );
  }

  return null;
}
