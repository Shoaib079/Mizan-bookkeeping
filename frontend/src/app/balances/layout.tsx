"use client";

import { SectionShell } from "@/components/layout/section-shell";

export default function BalancesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SectionShell sectionId="balances" ariaLabel="Balances sections">
      {children}
    </SectionShell>
  );
}
