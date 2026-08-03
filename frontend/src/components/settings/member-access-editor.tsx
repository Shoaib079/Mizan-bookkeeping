"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import {
  GRANT_GROUPS,
  grantsForRole,
  validateGrantSelection,
  type Grant,
} from "@/lib/member-grants";
import {
  ENTITY_ROLES,
  type EntityRole,
  type MembershipRow,
} from "@/lib/settings-types";
import { cn } from "@/lib/utils";

type Props = {
  membership: MembershipRow;
  open: boolean;
  saving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: { role: EntityRole; grants: Grant[] }) => Promise<void>;
};

function toggleGrant(selected: Set<Grant>, grant: Grant): Set<Grant> {
  const next = new Set(selected);
  if (next.has(grant)) next.delete(grant);
  else next.add(grant);
  return next;
}

export function MemberAccessEditor({
  membership,
  open,
  saving,
  error,
  onOpenChange,
  onSave,
}: Props) {
  const [role, setRole] = useState<EntityRole>(membership.role);
  const [selected, setSelected] = useState<Set<Grant>>(
    () => new Set((membership.grants ?? grantsForRole(membership.role)) as Grant[]),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const label = membership.user.display_name || membership.user.email;

  const validationError = useMemo(
    () => validateGrantSelection([...selected], role),
    [selected, role],
  );

  function applyPreset(nextRole: EntityRole) {
    setRole(nextRole);
    setSelected(new Set(grantsForRole(nextRole)));
    setLocalError(null);
  }

  async function handleSave() {
    const message = validateGrantSelection([...selected], role);
    if (message) {
      setLocalError(message);
      return;
    }
    setLocalError(null);
    await onSave({ role, grants: [...selected] });
  }

  return (
    <Dialog
      open={open}
      title={`Access for ${label}`}
      onClose={() => onOpenChange(false)}
      className="max-w-lg"
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Choose what this person can open and do in this restaurant. Changes apply
        within about 15 seconds on all their devices.
      </p>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-muted-foreground">Quick preset</span>
            <Select
              value={role}
              onChange={(event) => applyPreset(event.target.value as EntityRole)}
              disabled={saving}
            >
              {ENTITY_ROLES.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </Select>
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() => applyPreset(membership.role)}
          >
            Reset
          </Button>
        </div>

        {GRANT_GROUPS.map((group) => (
          <section key={group.id} className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold">{group.label}</h3>
              {group.description && (
                <p className="text-xs text-muted-foreground">{group.description}</p>
              )}
            </div>
            <ul className="space-y-1 rounded-lg border border-border/80 p-2">
              {group.grants.map((grant) => {
                const checked = selected.has(grant.value);
                return (
                  <li key={grant.value}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50",
                        saving && "pointer-events-none opacity-60",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        disabled={saving}
                        onChange={() => {
                          setSelected(toggleGrant(selected, grant.value));
                          setLocalError(null);
                        }}
                      />
                      <span>
                        <span className="font-medium">{grant.label}</span>
                        {grant.description && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {grant.description}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {(localError || validationError || error) && (
          <p className="text-sm text-destructive" role="alert">
            {localError || validationError || error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save access"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
