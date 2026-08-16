// @vitest-environment jsdom

/** A JSON body is sent as JSON, whether or not the caller remembered to say so.
 *
 * `POST /ledger/entries/actions` returned 422 in production from the day it
 * shipped. `fetch` with a string body and no `Content-Type` sends
 * `text/plain`, FastAPI declines to parse it as JSON, and the 422 names
 * `entry_ids` — a field the request did contain, which is why reading the
 * error pointed away from the cause.
 *
 * Thirty-odd call sites passed the header by hand. One did not, and the app
 * lost every Edit and Void button on the partner page for a week.
 *
 * This is the seam neither suite covered: component tests mock `apiFetch`, and
 * the backend's TestClient uses `json=`, which sets the header itself. So the
 * assertions here are on `fetch` — what actually left the browser.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";

const fetchMock = vi.fn();

function headersOf(call = 0): Record<string, string> {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  const entries = Object.entries(init.headers ?? {}) as [string, string][];
  return Object.fromEntries(entries.map(([k, v]) => [k.toLowerCase(), v]));
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
  });
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("a POST carrying a JSON string", () => {
  it("declares itself as JSON without the caller asking", async () => {
    await apiFetch("/entities/e1/ledger/entries/actions", {
      method: "POST",
      body: JSON.stringify({ entry_ids: ["id-1"] }),
    });
    expect(headersOf()["content-type"]).toBe("application/json");
  });

  it("leaves a caller's own header alone", async () => {
    // Several call sites set it explicitly and a couple send other types.
    // Overriding them here would break those instead.
    await apiFetch("/entities/e1/thing", {
      method: "POST",
      body: "a,b,c",
      headers: { "Content-Type": "text/csv" },
    });
    expect(headersOf()["content-type"]).toBe("text/csv");
  });

  it("does not care how the caller spelled the header", async () => {
    await apiFetch("/entities/e1/thing", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/vnd.custom+json" },
    });
    expect(headersOf()["content-type"]).toBe("application/vnd.custom+json");
  });
});

describe("a file upload", () => {
  it("is left without one, so the browser can set the boundary", async () => {
    // The failure this prevents is worse than the one above: a multipart body
    // labelled `application/json` has no boundary and the server cannot read
    // any of it.
    const body = new FormData();
    body.append("file", new Blob(["x"]), "statement.csv");

    await apiFetch("/entities/e1/statements", { method: "POST", body });

    expect(headersOf()["content-type"]).toBeUndefined();
  });
});

describe("a GET", () => {
  it("gets no body header, having no body", async () => {
    await apiFetch("/entities/e1/partners");
    expect(headersOf()["content-type"]).toBeUndefined();
  });
});
