import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  nextSearchGeneration,
  isStale,
  PALETTE_SEARCH_DEBOUNCE_MS,
  PALETTE_SEARCH_MIN_CHARS,
  searchSuppliers,
  searchExpenseItems,
} from "@/lib/palette-search";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api";

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe("palette-search stale guard", () => {
  it("isStale returns false for current generation", () => {
    const gen = nextSearchGeneration();
    expect(isStale(gen)).toBe(false);
  });

  it("isStale returns true after new generation", () => {
    const gen = nextSearchGeneration();
    nextSearchGeneration();
    expect(isStale(gen)).toBe(true);
  });
});

describe("searchSuppliers", () => {
  it("returns empty for short queries", async () => {
    const gen = nextSearchGeneration();
    const result = await searchSuppliers("ent-1", "a", gen);
    expect(result).toEqual([]);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("fetches from /suppliers?q= with limit", async () => {
    mockApiFetch.mockResolvedValue({
      items: [{ id: "s1", name: "Metro", vkn: "123" }],
      total: 1,
    });
    const gen = nextSearchGeneration();
    const result = await searchSuppliers("ent-1", "metro", gen);
    expect(result).toEqual([{ id: "s1", name: "Metro", vkn: "123" }]);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/entities/ent-1/suppliers?q=metro&limit=6",
    );
  });

  it("returns empty when stale", async () => {
    const gen = nextSearchGeneration();
    mockApiFetch.mockImplementation(async () => {
      nextSearchGeneration();
      return { items: [{ id: "s1", name: "Metro", vkn: null }], total: 1 };
    });
    const result = await searchSuppliers("ent-1", "metro", gen);
    expect(result).toEqual([]);
  });
});

describe("searchExpenseItems", () => {
  it("returns empty for short queries", async () => {
    const gen = nextSearchGeneration();
    const result = await searchExpenseItems("ent-1", "a", gen);
    expect(result).toEqual([]);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("fetches from /expense-items?q= with limit", async () => {
    mockApiFetch.mockResolvedValue({
      items: [{ id: "ei1", canonical_name: "Süt" }],
      total: 1,
    });
    const gen = nextSearchGeneration();
    const result = await searchExpenseItems("ent-1", "süt", gen);
    expect(result).toEqual([{ id: "ei1", canonical_name: "Süt" }]);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("/entities/ent-1/expense-items?q="),
    );
  });

  it("returns empty when stale", async () => {
    const gen = nextSearchGeneration();
    mockApiFetch.mockImplementation(async () => {
      nextSearchGeneration();
      return { items: [{ id: "ei1", canonical_name: "Süt" }], total: 1 };
    });
    const result = await searchExpenseItems("ent-1", "süt", gen);
    expect(result).toEqual([]);
  });
});

describe("constants", () => {
  it("debounce is ~250ms", () => {
    expect(PALETTE_SEARCH_DEBOUNCE_MS).toBe(250);
  });

  it("min chars is 2", () => {
    expect(PALETTE_SEARCH_MIN_CHARS).toBe(2);
  });
});
