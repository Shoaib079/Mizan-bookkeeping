"use client";

import { useEffect, useRef } from "react";

/** Fill a form from its subject once — not again when the data behind it
 *  refreshes.
 *
 * Both statement classifiers had the same fault. The effect that guesses a
 * classification for a bank line listed the thing it read as a dependency —
 * the pickers object in one, `line.suggestion` in the other — and both are
 * objects rebuilt on every refresh. So any poll finishing, window refocus or
 * unrelated re-render above re-ran the guess and replaced a classification
 * that had been chosen and not yet posted.
 *
 * Nothing flashed and nothing errored. The only way to catch it was to look
 * back at the picker before pressing Post, and what it costs when you do not
 * look is a payment posted against the wrong account.
 *
 * The rule is about the *subject*: arriving at a different line offers a fresh
 * guess, everything else leaves the form alone.
 *
 * `ready` is for the one honest exception. On first load the line can arrive
 * before the lists it needs, and a guess made without them cannot resolve a
 * supplier or an account — so a hydration performed while not ready is redone
 * once, when it is, and never after. Pass `true` where there is nothing to
 * wait for.
 *
 * `hydrate` is read through a ref, so passing a fresh closure each render —
 * which every caller does — cannot itself trigger a hydration. That is the
 * same identity trap this exists to close, one level up.
 */
export function useHydrateOnce(
  key: string | null,
  ready: boolean,
  hydrate: () => void,
): void {
  const latest = useRef(hydrate);
  latest.current = hydrate;

  const done = useRef<{ key: string; ready: boolean } | null>(null);

  useEffect(() => {
    if (key == null) return;
    const already = done.current;
    if (already?.key === key && (already.ready || !ready)) return;
    done.current = { key, ready };
    latest.current();
  }, [key, ready]);
}
