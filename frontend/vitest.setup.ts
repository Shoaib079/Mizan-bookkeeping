/** Browser APIs jsdom does not implement, stubbed once for every render test.
 *
 * Runs for the node-environment tests too — the great majority — so everything
 * here is guarded on `window` existing and does nothing there.
 */

if (typeof window !== "undefined" && !window.matchMedia) {
  // `useIsMobileShell` calls this on mount, and `Button` uses it for the 44px
  // touch target. So *every* component in this app reaches it, and without a
  // stub every render test fails on the same unrelated TypeError.
  //
  // Reports desktop. A test that cares about the mobile shell should override
  // this itself rather than have the default silently decide for it.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
