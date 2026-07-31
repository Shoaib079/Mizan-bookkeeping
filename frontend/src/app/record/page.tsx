"use client";

import { AppShell } from "@/components/layout/app-shell";
import { RecordDesk } from "@/components/record/record-desk";
import { RecordReviewPanel } from "@/components/record/record-review-panel";
import { useEntity } from "@/lib/entity-context";

export default function RecordPage() {
  const { entityId } = useEntity();

  return (
    <AppShell title="Record">
      <p className="mb-6 text-sm text-muted-foreground">
        {entityId
          ? "Type amounts for daily work, or switch to Upload for receipts and monthly bank or card statements."
          : "Select a restaurant in the sidebar to record transactions."}
      </p>
      <RecordReviewPanel />
      <RecordDesk />
    </AppShell>
  );
}
