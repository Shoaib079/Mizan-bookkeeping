import { describe, expect, it, vi } from "vitest";

import {
  AUTH_LOADED_POLL_MS,
  AUTH_TOKEN_MAX_ATTEMPTS,
  AUTH_TOKEN_RETRY_DELAY_MS,
  resolveClerkAuthHeaders,
  type ClerkAuthState,
} from "@/lib/api-auth-helpers";

function makeState(
  overrides: Partial<ClerkAuthState> & Pick<ClerkAuthState, "getToken">,
): ClerkAuthState {
  return {
    isLoaded: true,
    isSignedIn: true,
    ...overrides,
  };
}

describe("resolveClerkAuthHeaders", () => {
  it("waits until Clerk is loaded before returning headers", async () => {
    let loaded = false;
    const sleep = vi.fn(async (ms: number) => {
      if (ms === AUTH_LOADED_POLL_MS) loaded = true;
    });
    const getToken = vi.fn(async () => "tok");

    const headers = await resolveClerkAuthHeaders(
      () =>
        makeState({
          isLoaded: loaded,
          getToken,
        }),
      sleep,
    );

    expect(headers).toEqual({ Authorization: "Bearer tok" });
    expect(sleep).toHaveBeenCalledWith(AUTH_LOADED_POLL_MS);
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it("returns empty headers when signed out after load", async () => {
    const getToken = vi.fn(async () => "tok");

    const headers = await resolveClerkAuthHeaders(() =>
      makeState({ isSignedIn: false, getToken }),
    );

    expect(headers).toEqual({});
    expect(getToken).not.toHaveBeenCalled();
  });

  it("retries getToken when it briefly returns null", async () => {
    const getToken = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("ready-token");
    const sleep = vi.fn(async () => {});

    const headers = await resolveClerkAuthHeaders(
      () => makeState({ getToken }),
      sleep,
    );

    expect(headers).toEqual({ Authorization: "Bearer ready-token" });
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(AUTH_TOKEN_RETRY_DELAY_MS);
  });

  it("returns empty headers after max getToken attempts", async () => {
    const getToken = vi.fn(async () => null);
    const sleep = vi.fn(async () => {});

    const headers = await resolveClerkAuthHeaders(
      () => makeState({ getToken }),
      sleep,
    );

    expect(headers).toEqual({});
    expect(getToken).toHaveBeenCalledTimes(AUTH_TOKEN_MAX_ATTEMPTS);
  });

  it("returns empty headers when load never completes within cap", async () => {
    vi.useFakeTimers();
    const getToken = vi.fn(async () => "tok");

    const promise = resolveClerkAuthHeaders(
      () => makeState({ isLoaded: false, getToken }),
    );

    await vi.advanceTimersByTimeAsync(8000);
    await expect(promise).resolves.toEqual({});

    vi.useRealTimers();
  });
});
