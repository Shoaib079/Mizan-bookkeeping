"use client";

import { usePathname } from "next/navigation";
import { Children } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { SectionTabs } from "@/components/layout/section-tabs";
import { pageTitleForPathname } from "@/lib/nav-sections";

export default function DeliveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <AppShell title={pageTitleForPathname(pathname)}>
      <div>
        <SectionTabs sectionId="delivery" ariaLabel="Delivery sections" />
        <div>{Children.toArray(children)}</div>
      </div>
    </AppShell>
  );
}
