"use client";

import { usePathname } from "next/navigation";
import { Children } from "react";

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
      <div>
        <SectionTabs sectionId="banking" ariaLabel="Banking sections" />
        <div>{Children.toArray(children)}</div>
      </div>
    </AppShell>
  );
}
