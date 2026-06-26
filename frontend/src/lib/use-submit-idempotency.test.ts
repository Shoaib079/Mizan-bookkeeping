/** Stable idempotency key per submit intent — Slice 11.19. */

import { describe, expect, it, vi } from "vitest";

import {
  createSubmitIdempotencyStore,
  newIdempotencyKey,
} from "./use-submit-idempotency";

describe("newIdempotencyKey", () => {
  it("returns a UUID-shaped string", () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe("createSubmitIdempotencyStore", () => {
  it("returns the same key on retry until completeSubmit", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
        .mockReturnValueOnce("22222222-2222-4222-8222-222222222222"),
    });

    const store = createSubmitIdempotencyStore();
    const first = store.beginSubmit();
    const retry = store.beginSubmit();
    expect(first).toBe("11111111-1111-4111-8111-111111111111");
    expect(retry).toBe(first);

    store.completeSubmit();
    expect(store.peekKey()).toBeNull();

    const next = store.beginSubmit();
    expect(next).toBe("22222222-2222-4222-8222-222222222222");
    expect(next).not.toBe(first);
  });

  it("resetSubmit clears the in-flight key", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    });

    const store = createSubmitIdempotencyStore();
    store.beginSubmit();
    store.resetSubmit();
    const afterReset = store.beginSubmit();
    expect(afterReset).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });
});
