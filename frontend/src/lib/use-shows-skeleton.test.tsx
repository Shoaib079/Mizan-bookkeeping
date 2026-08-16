// @vitest-environment jsdom

/** A refresh must not blank the page it is refreshing.
 *
 * The owner: "i can literally see the app to kinda move and come back... i see
 * no movement but the app refresh in the background". Every page archetype
 * swapped its whole body for a skeleton whenever `loading` was true, and pages
 * set `loading` on every fetch — including the background ones React Query
 * fires on window focus and the ledger-changed event fires after any post. So
 * returning to the tab collapsed the page to grey blocks and sprang it back.
 *
 * Asserted through a rendered component rather than by reading the hook's
 * return, because the thing that matters is whether the content stayed on
 * screen — which is what a reader would call the bug.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useShowsSkeleton } from "@/lib/use-shows-skeleton";

// Not automatic in this project — the other render tests call it too. Without
// it `screen` searches every container a previous test left mounted, and these
// assertions find an earlier test's skeleton rather than this one's.
afterEach(cleanup);

function Page({ loading }: { loading: boolean }) {
  const showsSkeleton = useShowsSkeleton(loading);
  return showsSkeleton ? <p>skeleton</p> : <p>the figures</p>;
}

describe("before anything has loaded", () => {
  it("shows the skeleton, because there is nothing else to show", () => {
    render(<Page loading />);
    expect(screen.getByText("skeleton")).toBeTruthy();
  });

  it("gives way to the content when the first load lands", () => {
    const { rerender } = render(<Page loading />);
    rerender(<Page loading={false} />);
    expect(screen.getByText("the figures")).toBeTruthy();
  });
});

describe("once something has loaded", () => {
  it("keeps the content up while refreshing underneath it", () => {
    const { rerender } = render(<Page loading />);
    rerender(<Page loading={false} />);

    rerender(<Page loading />);

    expect(screen.queryByText("skeleton")).toBeNull();
    expect(screen.getByText("the figures")).toBeTruthy();
  });

  it("stays that way over repeated refreshes", () => {
    // Window focus fires this often. One refresh behaving and the next not
    // would be worse than the original, because it would look intermittent.
    const { rerender } = render(<Page loading />);
    rerender(<Page loading={false} />);

    for (let i = 0; i < 3; i += 1) {
      rerender(<Page loading />);
      expect(screen.queryByText("skeleton")).toBeNull();
      rerender(<Page loading={false} />);
    }
    expect(screen.getByText("the figures")).toBeTruthy();
  });
});

describe("on a fresh mount", () => {
  it("shows the skeleton again", () => {
    // Switching restaurants remounts the page tree — `<main key={entityId}>`.
    // Without this, one restaurant's figures would stay on screen under
    // another's name while the new ones loaded.
    const first = render(<Page loading />);
    first.rerender(<Page loading={false} />);
    first.unmount();

    render(<Page loading />);
    expect(screen.getByText("skeleton")).toBeTruthy();
  });
});
