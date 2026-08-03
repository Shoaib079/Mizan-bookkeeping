"use client";

import { AppShell } from "@/components/layout/app-shell";
import { RecordDesk } from "@/components/record/record-desk";
import { RecordReviewPanel } from "@/components/record/record-review-panel";
import { useIsMobileShell } from "@/lib/use-mobile-shell";

export default function RecordPage() {
  const isMobile = useIsMobileShell();

  return (
    <AppShell title="Record">
      {!isMobile && (
        <p className="mb-6 text-sm text-muted-foreground">
          Type amounts for daily work, or switch to Upload for receipts and monthly
          bank or card statements.
        </p>
      )}
      {!isMobile && <RecordReviewPanel />}
      <RecordDesk mobileQuick={isMobile} />
      {isMobile && (
        <div className="mt-4">
          <RecordReviewPanel />
        </div>
      )}
    </AppShell>
  );
}
