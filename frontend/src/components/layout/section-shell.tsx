"use client";

import { Children } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { SectionTabs } from "@/components/layout/section-tabs";
import type { NavSectionId } from "@/lib/nav-sections";

/** Shell title = section name. Tab labels live in SectionTabs only. */
const SECTION_SHELL_TITLE: Record<NavSectionId, string> = {
  sales: "Sales",
  banking: "Banking",
  suppliers: "Suppliers",
  customers: "Customers",
  staff: "Staff",
  partners: "Partners",
  review: "Review",
  delivery: "Delivery",
};

type SectionShellProps = {
  sectionId: NavSectionId;
  ariaLabel: string;
  children: React.ReactNode;
  /** When set, overrides the section name (e.g. account detail pages). */
  title?: string;
};

export function SectionShell({
  sectionId,
  ariaLabel,
  children,
  title,
}: SectionShellProps) {
  return (
    <AppShell title={title ?? SECTION_SHELL_TITLE[sectionId]}>
      <div>
        <SectionTabs sectionId={sectionId} ariaLabel={ariaLabel} />
        <div>{Children.toArray(children)}</div>
      </div>
    </AppShell>
  );
}
