import { describe, expect, it } from "vitest";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import {
  moneyAmountClassName,
  moneyLeadingIcon,
  moneyMovementIcon,
  moneyMovementTone,
} from "@/lib/mobile-ledger-card";

describe("mobile-ledger-card helpers", () => {
  it("tone follows the signed kuruş", () => {
    expect(moneyMovementTone(1)).toBe("in");
    expect(moneyMovementTone(-1)).toBe("out");
    expect(moneyMovementTone(0)).toBe("neutral");
  });

  it("icon follows the signed kuruş", () => {
    expect(moneyMovementIcon(100)).toBe(ArrowUpRight);
    expect(moneyMovementIcon(-100)).toBe(ArrowDownLeft);
    expect(moneyMovementIcon(0)).toBe(ArrowUpRight);
  });

  it("amount class follows the signed kuruş", () => {
    expect(moneyAmountClassName(50)).toBe("text-success");
    expect(moneyAmountClassName(-50)).toBe("text-destructive");
    expect(moneyAmountClassName(0)).toBe("");
  });

  it("leadingIcon bundles icon and tone", () => {
    expect(moneyLeadingIcon(10)).toEqual({
      icon: ArrowUpRight,
      tone: "in",
    });
    expect(moneyLeadingIcon(-10)).toEqual({
      icon: ArrowDownLeft,
      tone: "out",
    });
    expect(moneyLeadingIcon(0)).toEqual({
      icon: ArrowUpRight,
      tone: "neutral",
    });
  });
});
