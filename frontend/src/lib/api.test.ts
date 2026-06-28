import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  AUTH_401_MAX_ATTEMPTS,
  AUTH_401_RETRY_DELAY_MS,
  apiFetch,
  setAuthHeaderProvider,
} from "@/lib/api";

describe("apiFetch 401 retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    setAuthHeaderProvider(null);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("retries on 401 when auth provider is set and succeeds on later attempt", async () => {
    const provider = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Authorization: "Bearer token" });
    setAuthHeaderProvider(provider);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Authorization Bearer token required" }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const promise = apiFetch<{ ok: boolean }>("/entities?limit=50");
    await vi.advanceTimersByTimeAsync(AUTH_401_RETRY_DELAY_MS);
    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("does not retry 401 without auth provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Unauthorized" }), {
          status: 401,
        }),
      ),
    );

    await expect(apiFetch("/entities?limit=50")).rejects.toMatchObject({
      status: 401,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-401 errors", async () => {
    setAuthHeaderProvider(async () => ({ Authorization: "Bearer token" }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Forbidden" }), {
          status: 403,
        }),
      ),
    );

    await expect(apiFetch("/entities?limit=50")).rejects.toMatchObject({
      status: 403,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fails after max 401 retry attempts", async () => {
    setAuthHeaderProvider(async () => ({}));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Unauthorized" }), {
          status: 401,
        }),
      ),
    );

    const promise = apiFetch("/entities?limit=50");
    const expectation = expect(promise).rejects.toBeInstanceOf(ApiError);
    for (let i = 0; i < AUTH_401_MAX_ATTEMPTS - 1; i += 1) {
      await vi.advanceTimersByTimeAsync(AUTH_401_RETRY_DELAY_MS);
    }
    await expectation;
    expect(fetch).toHaveBeenCalledTimes(AUTH_401_MAX_ATTEMPTS);
  });
});
