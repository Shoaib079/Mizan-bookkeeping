"use client";

/** React Query setup (phase 6, audit C2b).
 *
 * - apiFetch keeps its own retry/backoff — query retry is off.
 * - staleTime 30s: navigating back to a page shows cached data instantly,
 *   then revalidates in the background (window focus refetch on).
 * - "mizan:ledger-changed" (fired by the transaction drawer and void dialogs)
 *   invalidates everything — any page showing money re-fetches.
 */

import {
  QueryClient,
  QueryClientProvider as TanstackProvider,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { LEDGER_CHANGED_EVENT } from "@/lib/ledger-events";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  useEffect(() => {
    function onLedgerChanged() {
      void queryClient.invalidateQueries();
    }
    window.addEventListener(LEDGER_CHANGED_EVENT, onLedgerChanged);
    return () =>
      window.removeEventListener(LEDGER_CHANGED_EVENT, onLedgerChanged);
  }, [queryClient]);

  return <TanstackProvider client={queryClient}>{children}</TanstackProvider>;
}
