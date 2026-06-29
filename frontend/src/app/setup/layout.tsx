"use client";

import { SectionShell } from "@/components/layout/section-shell";

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SectionShell sectionId="setup" ariaLabel="Set up sections">
      {children}
    </SectionShell>
  );
}
