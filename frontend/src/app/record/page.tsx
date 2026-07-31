"use client";

import { AppShell } from "@/components/layout/app-shell";
import { RecordHub } from "@/components/record/record-hub";
import { RecordReviewPanel } from "@/components/record/record-review-panel";
import { useEntity } from "@/lib/entity-context";

export default function RecordPage() {
  const { entityId } = useEntity();

  return (
    <AppShell title="Add">
      <p className="mb-6 text-sm text-muted-foreground">
        {entityId
          ? "Cash and partner-fronted daily expenses, salary, payments, and uploads — bank and card outflows come from the bank statement."
          : "Select a restaurant in the sidebar to add transactions."}
      </p>
      <RecordReviewPanel />
      <RecordHub />
    </AppShell>
  );
}
