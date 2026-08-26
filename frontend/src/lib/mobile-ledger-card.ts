/** Shared mobile ledger card helpers — tone + amount colour from signed kuruş. */

import {
  ArrowDownLeft,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";

import type { MobileRowIconTone } from "@/components/ui/mobile-card-list";

export function moneyMovementTone(kurus: number): MobileRowIconTone {
  if (kurus > 0) return "in";
  if (kurus < 0) return "out";
  return "neutral";
}

export function moneyMovementIcon(kurus: number): LucideIcon {
  return kurus < 0 ? ArrowDownLeft : ArrowUpRight;
}

export function moneyAmountClassName(kurus: number): string {
  if (kurus > 0) return "text-success";
  if (kurus < 0) return "text-destructive";
  return "";
}

export function moneyLeadingIcon(kurus: number): {
  icon: LucideIcon;
  tone: MobileRowIconTone;
} {
  return {
    icon: moneyMovementIcon(kurus),
    tone: moneyMovementTone(kurus),
  };
}
