"use client";

import { usePathname } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { SectionTabs } from "@/components/layout/section-tabs";
import { pageTitleForPathname } from "@/lib/nav-sections";

export default function BankingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <AppShell title={pageTitleForPathname(pathname)}>
      <SectionTabs sectionId="banking" ariaLabel="Banking sections" />
      {children}
    </AppShell>
  );
}
