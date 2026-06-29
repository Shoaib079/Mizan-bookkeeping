"use client";

import { SectionShell } from "@/components/layout/section-shell";

export default function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SectionShell sectionId="review" ariaLabel="Review sections">
      {children}
    </SectionShell>
  );
}
