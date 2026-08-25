/** Record hub + New menu + command palette — single action source (UX1). */

export type {
  QuickActionKey,
  RecordActionKey,
  RecordSectionId,
  PersonPickerKind,
  RecordActionDef,
} from "@/lib/record-actions-types";

export {
  RECORD_SECTION_LABELS,
  PRIMARY_RECORD_ACTION_IDS,
  RECORD_ACTIONS,
} from "@/lib/record-actions-catalog";
export type { PrimaryRecordActionId } from "@/lib/record-actions-catalog";

export {
  isQuickActionKey,
  PERSON_PICKER_ACTIONS,
  recordActionById,
  filterRecordActions,
  primaryRecordActions,
  recordActionsBySection,
  dailyVisibleSections,
  occasionalRecordActions,
} from "@/lib/record-actions-helpers";
