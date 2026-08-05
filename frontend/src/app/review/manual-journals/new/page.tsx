"use client";

/** Write a journal by hand. Sits under Review → Manual journals, beside the
 * list of the ones already posted, because that is where you go to look at
 * them — and where you go to void one if this was a mistake. */

import { ManualJournalForm } from "@/components/forms/manual-journal-form";

export default function NewManualJournalPage() {
  return <ManualJournalForm />;
}
