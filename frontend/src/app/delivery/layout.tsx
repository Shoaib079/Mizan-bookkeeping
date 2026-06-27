"use client";

import { usePathname } from "next/navigation";

import { DeliveryTabs } from "@/components/delivery/delivery-tabs";
import { AppShell } from "@/components/layout/app-shell";

function deliveryTitle(pathname: string): string {
  if (pathname.startsWith("/delivery/reports/")) return "Review delivery report";
  if (pathname === "/delivery/platforms") return "Delivery platforms";
  if (pathname.startsWith("/delivery/reports")) return "Delivery reports";
  if (pathname === "/delivery/settlements") return "Delivery settlements";
  return "Delivery";
}

export default function DeliveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AppShell title={deliveryTitle(pathname)}>
      <DeliveryTabs />
      {children}
    </AppShell>
  );
}
