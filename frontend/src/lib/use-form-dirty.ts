"use client";

import { useCallback, useEffect, useState } from "react";

import { statesDiffer } from "@/lib/form-draft";
import { useRegisterUnsaved } from "@/lib/unsaved-work";

/** Resets when the dialog closes — opening edit alone is not a user edit. */
export function useFormTouched(open: boolean) {
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) setTouched(false);
  }, [open]);

  const markTouched = useCallback(() => {
    setTouched(true);
  }, []);

  return { touched, markTouched };
}

/** Compare form state to baseline; warn only after the user has edited something. */
export function useFormDirty(
  sourceId: string,
  baseline: unknown | null,
  current: unknown,
  enabled: boolean,
  touched: boolean,
): boolean {
  const dirty =
    enabled && touched && baseline !== null && statesDiffer(baseline, current);
  useRegisterUnsaved(sourceId, dirty, enabled);
  return dirty;
}

/** Edit/correct dialogs — touch tracking + dirty registration in one hook. */
export function useEditFormDirty(
  sourceId: string,
  open: boolean,
  baseline: unknown | null,
  current: unknown,
) {
  const { touched, markTouched } = useFormTouched(open);
  const dirty = useFormDirty(sourceId, baseline, current, open, touched);
  return { dirty, markTouched };
}
