"use client";

import { usePathname } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { SectionTabs } from "@/components/layout/section-tabs";
import type { NavSectionId } from "@/lib/nav-sections";
import { pageTitleForPathname } from "@/lib/nav-sections";

type SectionShellProps = {
  sectionId: NavSectionId;
  ariaLabel: string;
  children: React.ReactNode;
  /** When set, overrides pathname-derived title (e.g. account detail pages). */
  title?: string;
};

export function SectionShell({
  sectionId,
  ariaLabel,
  children,
  title,
}: SectionShellProps) {
  const pathname = usePathname();
  return (
    <AppShell title={title ?? pageTitleForPathname(pathname)}>
      <SectionTabs sectionId={sectionId} ariaLabel={ariaLabel} />
      {children}
    </AppShell>
  );
}
