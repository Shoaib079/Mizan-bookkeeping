"use client";

/** Whether a skeleton should replace the page, or it should refresh underneath.
 *
 * Every page archetype swapped its whole body for `<PageSkeleton />` whenever
 * `loading` was true, and each page sets `loading` on *every* fetch — including
 * the background ones. React Query refetches on window focus, and
 * `mizan:ledger-changed` invalidates everything after a post or a void. So
 * coming back to the tab, or recording anything, made the page collapse to
 * grey blocks and spring back a second later. The owner: "i can literally see
 * the app to kinda move and come back... i see no movement but the app refresh
 * in the background".
 *
 * A skeleton is for when there is nothing to show yet. Once a load has
 * finished, there is something to show, and the honest thing is to leave it up
 * until better data arrives. Nothing is hidden by this: the figures update the
 * moment they land, and an error still renders above them.
 *
 * "Has anything finished loading" is remembered per mount rather than guessed
 * from whether the slots are empty — a genuinely empty ledger has no slots and
 * would flash a skeleton on every refresh forever.
 *
 * Switching restaurants remounts the page tree (`<main key={entityId}>`), so
 * this resets and the skeleton returns. That matters: without it a page would
 * keep one restaurant's figures on screen under another's name while the new
 * ones loaded, which is exactly the kind of bleed the entity boundary exists
 * to prevent.
 */

import { useEffect, useRef } from "react";

export function useShowsSkeleton(loading: boolean): boolean {
  const hasSettled = useRef(false);

  useEffect(() => {
    if (!loading) hasSettled.current = true;
  }, [loading]);

  return loading && !hasSettled.current;
}
