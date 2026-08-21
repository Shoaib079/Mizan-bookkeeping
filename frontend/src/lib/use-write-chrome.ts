/** Shared grant → write-chrome flags for S3 page gates. */

import {
  canUseRecordAction,
  shouldShowWriteChrome,
} from "@/lib/entity-access";
import { useEntityAccess } from "@/lib/use-entity-access";

export function useWriteChrome() {
  const { grants } = useEntityAccess();
  return {
    grants,
    showWrite: shouldShowWriteChrome(grants),
    showCountCash: canUseRecordAction(grants, "countCash"),
    showCloseDay: canUseRecordAction(grants, "closeDay"),
  };
}
