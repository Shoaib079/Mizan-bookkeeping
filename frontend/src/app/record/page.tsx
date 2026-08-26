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
            : "Pick a type, fill the form, and see recent transactions below."
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
