import { describe, expect, it } from "vitest";

import {
  advanceAppliedPreview,
  isValidStaffSalaryEmployee,
  payableClearedPreview,
  STAFF_SALARY_EMPLOYEE_PLACEHOLDER,
} from "@/lib/staff-salary";

describe("isValidStaffSalaryEmployee", () => {
  it("requires a real id and name", () => {
    expect(isValidStaffSalaryEmployee("emp-1", "Ayşe")).toBe(true);
    expect(isValidStaffSalaryEmployee("", "Ayşe")).toBe(false);
    expect(isValidStaffSalaryEmployee("emp-1", "")).toBe(false);
  });

  it("rejects the generic Employee placeholder", () => {
    expect(isValidStaffSalaryEmployee("emp-1", STAFF_SALARY_EMPLOYEE_PLACEHOLDER)).toBe(
      false,
    );
  });
});

describe("advanceAppliedPreview (auto-nets against all owed)", () => {
  it("applies advance up to owed minus cash", () => {
    expect(advanceAppliedPreview(300_000, 450_000, 150_000)).toBe(150_000);
  });

  it("caps advance when cash leaves less room", () => {
    expect(advanceAppliedPreview(400_000, 450_000, 150_000)).toBe(50_000);
  });

  it("returns zero when nothing owed, no advance, or cash covers it all", () => {
    expect(advanceAppliedPreview(100_000, 0, 50_000)).toBe(0);
    expect(advanceAppliedPreview(100_000, 200_000, 0)).toBe(0);
    expect(advanceAppliedPreview(500_000, 450_000, 150_000)).toBe(0);
  });

  it("nets against extra-days owed beyond the period (Latif case)", () => {
    // 13.440 extra days owed, 13.515 advance, no cash → advance clears it.
    expect(advanceAppliedPreview(0, 1_344_000, 1_351_500)).toBe(1_344_000);
  });
});

describe("payableClearedPreview", () => {
  it("sums cash and applied advance", () => {
    expect(payableClearedPreview(300_000, 450_000, 150_000)).toBe(450_000);
  });
});
