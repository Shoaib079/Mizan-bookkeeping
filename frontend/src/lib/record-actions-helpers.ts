/** Record hub action helpers — filter, section views, quick-key checks. */

import { canUseRecordAction } from "@/lib/entity-access";
import {
  DAILY_VISIBLE_SECTIONS,
  PRIMARY_RECORD_ACTION_IDS,
  RECORD_ACTIONS,
} from "@/lib/record-actions-catalog";
import type {
  QuickActionKey,
  RecordActionDef,
  RecordActionKey,
  RecordSectionId,
} from "@/lib/record-actions-types";

const QUICK_ACTION_KEYS = new Set<QuickActionKey>([
  "expense",
  "sales",
  "fx",
  "posPhoto",
  "deliveryReport",
  "receipt",
  "supplier",
  "efatura",
]);

export function isQuickActionKey(key: RecordActionKey): key is QuickActionKey {
  return QUICK_ACTION_KEYS.has(key as QuickActionKey);
}

export const PERSON_PICKER_ACTIONS = new Set<RecordActionKey>(
  RECORD_ACTIONS.filter((action) => action.personKind).map((action) => action.id),
);

export function recordActionById(id: RecordActionKey): RecordActionDef {
  const action = RECORD_ACTIONS.find((entry) => entry.id === id);
  if (!action) throw new Error(`Unknown record action: ${id}`);
  return action;
}

export function filterRecordActions(
  actions: RecordActionDef[],
  opts: { deliveryEnabled: boolean; grants?: readonly string[] },
): RecordActionDef[] {
  return actions.filter((action) => {
    if (opts.grants && !canUseRecordAction(opts.grants, action.id)) return false;
    return !action.requiresDelivery || opts.deliveryEnabled;
  });
}

export function primaryRecordActions(
  opts: { deliveryEnabled: boolean; grants?: readonly string[] },
): RecordActionDef[] {
  const available = filterRecordActions(RECORD_ACTIONS, opts);
  return PRIMARY_RECORD_ACTION_IDS.map((id) =>
    available.find((action) => action.id === id),
  ).filter((action): action is RecordActionDef => action !== undefined);
}

export function recordActionsBySection(
  section: RecordSectionId,
  opts: { deliveryEnabled: boolean; grants?: readonly string[] },
): RecordActionDef[] {
  const primary = new Set<RecordActionKey>(PRIMARY_RECORD_ACTION_IDS);
  return filterRecordActions(
    RECORD_ACTIONS.filter(
      (action) =>
        action.section === section &&
        !action.hidden &&
        !primary.has(action.id),
    ),
    opts,
  );
}

export function dailyVisibleSections(
  opts: { deliveryEnabled: boolean; grants?: readonly string[] },
): { section: RecordSectionId; actions: RecordActionDef[] }[] {
  return DAILY_VISIBLE_SECTIONS.map((section) => ({
    section,
    actions: recordActionsBySection(section, opts),
  })).filter((entry) => entry.actions.length > 0);
}

export function occasionalRecordActions(
  opts: { deliveryEnabled: boolean; grants?: readonly string[] },
): RecordActionDef[] {
  return recordActionsBySection("occasional", opts);
}
