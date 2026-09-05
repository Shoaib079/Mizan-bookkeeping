import { describe, expect, it } from "vitest";

import { classifyTargetFieldLabel } from "@/lib/statement-classify-target-label";
import { sourceDeclaring } from "@/test-support/source";

describe("classifyTargetFieldLabel", () => {
  it("names employee and supplier targets for mobile labels", () => {
    expect(classifyTargetFieldLabel("employee")).toBe("Employee");
    expect(classifyTargetFieldLabel("supplier")).toBe("Supplier");
    expect(classifyTargetFieldLabel(null)).toBeNull();
  });
});

describe("StatementClassifyBar mobile stack", () => {
  it("stacks under 819px and hides empty target / desktop tip on phone", () => {
    const bar = sourceDeclaring("StatementClassifyBar");
    expect(bar).toContain("max-[819px]:flex-col");
    expect(bar).toContain("min-[820px]:flex-row");
    expect(bar).toContain("classifyTargetFieldLabel");
    expect(bar).toContain("targetKind ?");
    expect(bar).toContain("max-[819px]:w-full");
    expect(bar).toContain("hidden text-[11px] text-muted-foreground min-[820px]:block");
    // Salary dialog path stays Post → dialog (not open-on-employee-select).
    expect(bar).toContain("StaffSalaryPaymentDialog");
    expect(bar).not.toContain("setSalaryDialogOpen(true)");
  });
});

describe("StatementBulkActionForm mobile stack", () => {
  it("stacks classification/target and omits target when none required", () => {
    const form = sourceDeclaring("StatementBulkActionForm");
    expect(form).toContain("max-[819px]:flex-col");
    expect(form).toContain("classifyTargetFieldLabel");
    expect(form).toContain("targetKind ?");
    expect(form).toContain("max-[819px]:w-full");
  });
});
