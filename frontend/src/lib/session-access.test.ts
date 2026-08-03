import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  isSessionRevokedError,
  notifyRoleChanged,
  notifySessionRevoked,
  registerRoleChangeHandler,
  registerSessionRevokeHandler,
  resetSessionRevokeGuard,
  roleChangeUserMessage,
  sessionRevokeReasonFromMessage,
  sessionRevokeUserMessage,
} from "@/lib/session-access";

describe("sessionRevokeReasonFromMessage", () => {
  it("maps backend revoke messages", () => {
    expect(sessionRevokeReasonFromMessage("User is inactive")).toBe("inactive");
    expect(sessionRevokeReasonFromMessage("Not a member of this entity")).toBe(
      "removed",
    );
    expect(sessionRevokeReasonFromMessage("User is not provisioned")).toBe(
      "unprovisioned",
    );
    expect(sessionRevokeReasonFromMessage("Forbidden")).toBeNull();
  });
});

describe("isSessionRevokedError", () => {
  it("detects revoked 403 ApiError", () => {
    expect(
      isSessionRevokedError(new ApiError("User is inactive", 403)),
    ).toBe("inactive");
    expect(isSessionRevokedError(new ApiError("Forbidden", 403))).toBeNull();
    expect(
      isSessionRevokedError(new ApiError("User is inactive", 401)),
    ).toBeNull();
  });
});

describe("sessionRevokeUserMessage", () => {
  it("returns user-facing copy for each reason", () => {
    expect(sessionRevokeUserMessage("removed")).toContain("no longer have access");
    expect(sessionRevokeUserMessage("inactive")).toContain("deactivated");
  });
});

describe("notifySessionRevoked", () => {
  it("runs handler once until reset", () => {
    resetSessionRevokeGuard();
    const calls: string[] = [];
    registerSessionRevokeHandler((_reason, message) => {
      calls.push(message);
    });

    notifySessionRevoked("removed");
    notifySessionRevoked("removed");
    expect(calls).toHaveLength(1);

    registerSessionRevokeHandler(null);
    resetSessionRevokeGuard();
  });
});

describe("notifyRoleChanged", () => {
  it("notifies handler with friendly label", () => {
    const messages: string[] = [];
    registerRoleChangeHandler((_previous, _next, message) => {
      messages.push(message);
    });

    notifyRoleChanged("cashier", "partner");
    expect(messages).toEqual([roleChangeUserMessage("cashier", "partner")]);
    expect(messages[0]).toContain("Partner");

    registerRoleChangeHandler(null);
  });

  it("ignores identical roles", () => {
    let count = 0;
    registerRoleChangeHandler(() => {
      count += 1;
    });
    notifyRoleChanged("owner", "owner");
    expect(count).toBe(0);
    registerRoleChangeHandler(null);
  });
});
