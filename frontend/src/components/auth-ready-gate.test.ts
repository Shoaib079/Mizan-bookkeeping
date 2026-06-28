import { describe, expect, it } from "vitest";

import {
  isPublicAuthRoute,
  shouldBlockUntilAuthReady,
} from "@/components/auth-ready-gate";

describe("shouldBlockUntilAuthReady", () => {
  it("allows public sign-in routes before auth is ready", () => {
    expect(
      shouldBlockUntilAuthReady({
        clerkEnabled: true,
        isAuthReady: false,
        pathname: "/sign-in",
      }),
    ).toBe(false);
  });

  it("allows public sign-up routes before auth is ready", () => {
    expect(
      shouldBlockUntilAuthReady({
        clerkEnabled: true,
        isAuthReady: false,
        pathname: "/sign-up",
      }),
    ).toBe(false);
  });

  it("blocks app routes until auth is ready when Clerk is enabled", () => {
    expect(
      shouldBlockUntilAuthReady({
        clerkEnabled: true,
        isAuthReady: false,
        pathname: "/",
      }),
    ).toBe(true);
  });

  it("does not block when Clerk is disabled", () => {
    expect(
      shouldBlockUntilAuthReady({
        clerkEnabled: false,
        isAuthReady: true,
        pathname: "/",
      }),
    ).toBe(false);
  });

  it("does not block once auth is ready", () => {
    expect(
      shouldBlockUntilAuthReady({
        clerkEnabled: true,
        isAuthReady: true,
        pathname: "/reports",
      }),
    ).toBe(false);
  });
});

describe("isPublicAuthRoute", () => {
  it("matches nested sign-in paths", () => {
    expect(isPublicAuthRoute("/sign-in/factor-one")).toBe(true);
  });
});
