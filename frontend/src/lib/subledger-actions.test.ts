import { describe, expect, it } from "vitest";

import {
  BANK_VOID_ONLY_JOURNAL_SOURCES,
  customerLedgerRowActions,
  generalLedgerEntryActions,
  journalEntryRowActions,
  partnerLedgerRowActions,
  staffLedgerRowActions,
  transactionPeekActions,
} from "@/lib/subledger-actions";

describe("subledger-actions", () => {
  it("allows generic manual edit and void", () => {
    expect(journalEntryRowActions("manual")).toEqual({
      canEdit: true,
      canVoid: true,
    });
  });

  it("allows bank fee edit and void via generic GL", () => {
    expect(journalEntryRowActions("bank_fee")).toEqual({
      canEdit: true,
      canVoid: true,
    });
  });

  it("allows card commission edit and void via generic GL", () => {
    expect(journalEntryRowActions("pos_commission_sweep")).toEqual({
      canEdit: true,
      canVoid: true,
    });
    expect(journalEntryRowActions("pos_commission_statement")).toEqual({
      canEdit: true,
      canVoid: true,
    });
  });

  it("bank statement sources are void-only", () => {
    for (const source of BANK_VOID_ONLY_JOURNAL_SOURCES) {
      expect(journalEntryRowActions(source).canEdit).toBe(false);
      expect(journalEntryRowActions(source).canVoid).toBe(true);
    }
  });

  it("dedicated partner sources are editable on partner pages", () => {
    expect(partnerLedgerRowActions("drawing")).toEqual({
      canEdit: true,
      canVoid: true,
    });
    expect(partnerLedgerRowActions("capital_contribution")).toEqual({
      canEdit: false,
      canVoid: true,
    });
    expect(partnerLedgerRowActions("profit_allocation")).toEqual({
      canEdit: false,
      canVoid: false,
    });
  });

  it("staff advance offset rows are void-only", () => {
    expect(
      staffLedgerRowActions({
        movementType: "salary_payment",
        payCurrency: "TRY",
        isAdvanceOffset: true,
        advanceAppliedMinor: 0,
      }),
    ).toEqual({ canEdit: false, canVoid: true });
  });

  it("customer credit sale and payment are editable", () => {
    expect(
      customerLedgerRowActions({
        movementType: "credit_sale",
        referenceType: null,
      }),
    ).toEqual({ canEdit: true, canVoid: true });
    expect(
      customerLedgerRowActions({ movementType: "payment_received" }),
    ).toEqual({ canEdit: true, canVoid: true });
  });

  it("GL uses generic endpoints only for the safe allowlist", () => {
    expect(generalLedgerEntryActions("manual").useGenericEndpoints).toBe(true);
    expect(generalLedgerEntryActions("expense_entry").useGenericEndpoints).toBe(
      false,
    );
    expect(generalLedgerEntryActions("expense_entry").flowHref).toBe(
      "/review/expenses",
    );
  });

  it("transaction peek voids generic-safe sources beyond manual/bank_fee", () => {
    expect(transactionPeekActions("transfer", "posted")).toEqual({
      canEdit: false,
      canVoid: true,
    });
    expect(transactionPeekActions("year_end_close", "posted")).toEqual({
      canEdit: false,
      canVoid: true,
    });
    expect(transactionPeekActions("expense_entry", "posted")).toEqual({
      canEdit: false,
      canVoid: false,
    });
    expect(transactionPeekActions("rule_auto", "posted")).toEqual({
      canEdit: false,
      canVoid: false,
    });
  });
});
