import { describe, expect, it } from "vitest";

import {
  directoryInactiveSplitIndex,
  sortDirectoryActiveFirst,
} from "@/lib/directory-list";

describe("sortDirectoryActiveFirst", () => {
  it("puts inactive rows after active ones", () => {
    const rows = sortDirectoryActiveFirst([
      { id: "b", name: "Burak", is_active: false },
      { id: "a", name: "Ali", is_active: true },
      { id: "c", name: "Cem", is_active: false },
    ]);
    expect(rows.map((row) => row.name)).toEqual(["Ali", "Burak", "Cem"]);
  });
});

describe("directoryInactiveSplitIndex", () => {
  it("returns the first inactive index when active rows come first", () => {
    expect(
      directoryInactiveSplitIndex([
        { name: "Ali", is_active: true },
        { name: "Burak", is_active: false },
      ]),
    ).toBe(1);
  });

  it("returns undefined when there are no inactive rows", () => {
    expect(
      directoryInactiveSplitIndex([{ name: "Ali", is_active: true }]),
    ).toBeUndefined();
  });
});
