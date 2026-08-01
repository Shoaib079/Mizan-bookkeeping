"use client";

import { AppShell } from "@/components/layout/app-shell";
import { RecordDesk } from "@/components/record/record-desk";
import { RecordReviewPanel } from "@/components/record/record-review-panel";

export default function RecordPage() {
  return (
    <AppShell title="Record">
      <p className="mb-6 text-sm text-muted-foreground">
        Type amounts for daily work, or switch to Upload for receipts and monthly
        bank or card statements.
      </p>
      <RecordReviewPanel />
      <RecordDesk />
    </AppShell>
  );
}
