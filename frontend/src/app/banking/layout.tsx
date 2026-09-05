"use client";

import { Children } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { SectionTabs } from "@/components/layout/section-tabs";

export default function BankingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell title="Banking">
      <div>
        <SectionTabs sectionId="banking" ariaLabel="Banking sections" />
        <div>{Children.toArray(children)}</div>
      </div>
    </AppShell>
  );
}
