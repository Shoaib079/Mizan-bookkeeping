import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CASH_COUNT_DRAFT_FORM_KEY,
  emptyCashCountDraft,
  hasCashCountDraft,
  isCashCountDraftEmpty,
  normalizeDraftQuantities,
  quantitiesToDraft,
} from "@/lib/cash-count-draft";
import { formDraftStorageKey } from "@/lib/form-draft";

const ENTITY = "entity-cash-count-draft";
const store: Record<string, string> = {};

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cash count draft", () => {
  it("treats empty notes and blank total as empty", () => {
    expect(isCashCountDraftEmpty(emptyCashCountDraft())).toBe(true);
  });

  it("is non-empty when notes or total are set", () => {
    expect(
      isCashCountDraftEmpty({
        ...emptyCashCountDraft(),
        countedText: "100,00",
      }),
    ).toBe(false);
    expect(
      isCashCountDraftEmpty({
        ...emptyCashCountDraft(),
        quantities: { "20000": 1 },
      }),
    ).toBe(false);
  });

  it("normalizes string keys from JSON storage", () => {
    const q = normalizeDraftQuantities({ "20000": 2, "10000": 1 });
    expect(q[20000]).toBe(2);
    expect(q[10000]).toBe(1);
    expect(q[5000]).toBe(0);
  });

  it("round-trips quantities for draft snapshots", () => {
    const draft = quantitiesToDraft({ 20000: 3, 100: 0 } as Record<
      number,
      number
    >);
    expect(normalizeDraftQuantities(draft)[20000]).toBe(3);
  });

  it("detects a saved draft in localStorage", () => {
    expect(hasCashCountDraft(ENTITY)).toBe(false);
    const key = formDraftStorageKey(ENTITY, CASH_COUNT_DRAFT_FORM_KEY);
    localStorage.setItem(
      key!,
      JSON.stringify({
        ...emptyCashCountDraft(),
        quantities: { "5000": 4 },
      }),
    );
    expect(hasCashCountDraft(ENTITY)).toBe(true);
  });
});
