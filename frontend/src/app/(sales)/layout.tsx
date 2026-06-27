"use client";

import { SectionShell } from "@/components/layout/section-shell";

export default function SalesSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SectionShell sectionId="sales" ariaLabel="Sales sections">
      {children}
    </SectionShell>
  );
}
