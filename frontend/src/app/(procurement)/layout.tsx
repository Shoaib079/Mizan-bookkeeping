"use client";

import { SectionShell } from "@/components/layout/section-shell";

export default function ProcurementSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SectionShell sectionId="suppliers" ariaLabel="Suppliers sections">
      {children}
    </SectionShell>
  );
}
