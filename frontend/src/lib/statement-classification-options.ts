/** Bank statement line classification — shared labels and amount-aware filtering. */

export type {
  ClassificationTarget,
  ClassificationOption,
  ClassificationOptionGroups,
} from "@/lib/statement-classification-types";

export { STATEMENT_CLASSIFICATION_OPTIONS } from "@/lib/statement-classification-catalog";

export {
  classificationComboboxOptionsForAmount,
  classificationOptionGroups,
  classificationOptionsForAmount,
  classificationMatchesAmount,
  classificationOption,
  classificationLabel,
  suggestClassificationForLine,
  initialClassificationForLine,
  suggestDeliveryPlatformId,
  suggestSupplierId,
  likelyDeliveryBrandInDescription,
  deliveryPlatformPickerHint,
  truncateStatementText,
} from "@/lib/statement-classification-helpers";
