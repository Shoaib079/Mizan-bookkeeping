"use client";

/** Who draws the page title — the chrome, or the page?
 *
 * `AppShell` has always drawn an `<h1>` for the section. Now that pages carry
 * their own `PageHeader` (DESIGN_ARCHETYPES §1) both would render a heading,
 * so the page tells the shell to stand down and the shell keeps only the
 * breadcrumb. Registration is a layout effect, so the shell's heading is gone
 * before paint — no flash of a title that then vanishes.
 *
 * Once every page owns a `PageHeader` (slice 7) the shell's heading and this
 * handshake both go away. */

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

type Registry = {
  pageOwnsTitle: boolean;
  claim: (owns: boolean) => void;
};

const PageTitleSlotContext = createContext<Registry | null>(null);

export function PageTitleSlotProvider({
  children,
}: {
  children: (pageOwnsTitle: boolean) => React.ReactNode;
}) {
  const [claims, setClaims] = useState(0);
  const claim = useCallback((owns: boolean) => {
    setClaims((count) => count + (owns ? 1 : -1));
  }, []);
  const value = useMemo(
    () => ({ pageOwnsTitle: claims > 0, claim }),
    [claims, claim],
  );

  return (
    <PageTitleSlotContext.Provider value={value}>
      {children(claims > 0)}
    </PageTitleSlotContext.Provider>
  );
}

/** Called by `PageHeader`. Safe outside a provider (tests, storybook). */
export function useClaimPageTitle(): void {
  const registry = useContext(PageTitleSlotContext);
  const claim = registry?.claim;
  useLayoutEffect(() => {
    if (!claim) return;
    claim(true);
    return () => claim(false);
  }, [claim]);
}
