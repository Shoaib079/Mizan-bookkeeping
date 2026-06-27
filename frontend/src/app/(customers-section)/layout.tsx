"use client";

import { SectionShell } from "@/components/layout/section-shell";

export default function CustomersSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SectionShell sectionId="customers" ariaLabel="Customers sections">
      {children}
    </SectionShell>
  );
}
