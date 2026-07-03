import { beforeEach, describe, it, expect, vi } from "vitest";
import { clearMizanStorage } from "./entity-context";

const storage = new Map<string, string>();

vi.stubGlobal("window", {});
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
  clear: () => storage.clear(),
  get length() { return storage.size; },
  key: (i: number) => [...storage.keys()][i] ?? null,
});

describe("clearMizanStorage", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("removes all mizan.* and mizan:* keys", () => {
    localStorage.setItem("mizan.entityId", "ent-1");
    localStorage.setItem("mizan.actorId", "act-1");
    localStorage.setItem("mizan.sidebar.nav.groups", "{}");
    localStorage.setItem("mizan:draft:some-form:ent-1", '{"a":1}');
    localStorage.setItem("unrelated-key", "keep");

    clearMizanStorage();

    expect(localStorage.getItem("mizan.entityId")).toBeNull();
    expect(localStorage.getItem("mizan.actorId")).toBeNull();
    expect(localStorage.getItem("mizan.sidebar.nav.groups")).toBeNull();
    expect(localStorage.getItem("mizan:draft:some-form:ent-1")).toBeNull();
    expect(localStorage.getItem("unrelated-key")).toBe("keep");
  });

  it("is safe to call when no mizan keys exist", () => {
    localStorage.setItem("other", "value");
    clearMizanStorage();
    expect(localStorage.getItem("other")).toBe("value");
  });
});
