"use client";

import { Children } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { SectionTabs } from "@/components/layout/section-tabs";

export default function DeliveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell title="Delivery" hideTrail>
      <div>
        <SectionTabs sectionId="delivery" ariaLabel="Delivery sections" />
        <div>{Children.toArray(children)}</div>
      </div>
    </AppShell>
  );
}
