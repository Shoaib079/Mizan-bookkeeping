import { describe, expect, it } from "vitest";

import { sourceDeclaringAll, sourceFiles } from "@/test-support/source";

/** API list endpoints reject limit > 200 — `MAX_LIST_LIMIT` in
 *  `backend/app/core/listing/params.py`. Asking for more is a 422, which on
 *  the balances hub shows up as an empty table rather than as an error. */
const MAX = 200;

describe("Balances hub list limits", () => {
  it("the hub's own hooks ask for the maximum", () => {
    const source = sourceDeclaringAll("useBalanceMap", "useStaffBalanceTotal");
    expect(source).toContain(`limit=${MAX}`);
  });

  it("nothing anywhere asks for more", () => {
    /* Widened from the two hub files this used to read by path.
     *
     * The cap belongs to the API, not to the hub, so a guard watching two
     * files was watching the two that had already been fixed — every other
     * caller sat outside it, including every one written since. */
    const over = sourceFiles()
      .filter((file) =>
        [...file.text.matchAll(/limit=(\d+)/g)].some(
          (match) => Number(match[1]) > MAX,
        ),
      )
      .map((file) => file.path);
    expect(
      over,
      `these ask for more than the API's ${MAX}: ${over.join(", ")}`,
    ).toEqual([]);
  });
});
