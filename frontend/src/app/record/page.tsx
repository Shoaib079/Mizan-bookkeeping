"use client";

/** Record desk — DESIGN_ARCHETYPES §4 (hub). */

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page/page-header";
import { RecordDesk } from "@/components/record/record-desk";
import { RecordReviewPanel } from "@/components/record/record-review-panel";
import { useIsMobileShell } from "@/lib/use-mobile-shell";

export default function RecordPage() {
  const isMobile = useIsMobileShell();

  return (
    <AppShell title="Record">
      <PageHeader
        title="Record"
        meta={
          isMobile
            ? undefined
            : "Type amounts for daily work, or switch to Upload for receipts and monthly bank or card statements."
        }
      />
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
