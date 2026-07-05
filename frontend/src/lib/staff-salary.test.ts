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

describe("advanceAppliedPreview", () => {
  it("applies advance up to remaining accrual minus cash", () => {
    expect(advanceAppliedPreview(300_000, 450_000, 150_000)).toBe(150_000);
  });

  it("caps advance when cash leaves less room", () => {
    expect(advanceAppliedPreview(400_000, 450_000, 150_000)).toBe(50_000);
  });

  it("returns zero when no advance or accrual", () => {
    expect(advanceAppliedPreview(100_000, 0, 50_000)).toBe(0);
    expect(advanceAppliedPreview(100_000, 200_000, 0)).toBe(0);
  });
});

describe("payableClearedPreview", () => {
  it("sums cash and applied advance", () => {
    expect(payableClearedPreview(300_000, 450_000, 150_000)).toBe(450_000);
  });
});
