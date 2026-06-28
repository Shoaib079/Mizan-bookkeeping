"use client";

import { useAuth } from "@clerk/nextjs";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { resolveClerkAuthHeaders } from "@/lib/api-auth-helpers";
import { setAuthHeaderProvider } from "@/lib/api";

type ApiAuthContextValue = {
  clerkEnabled: boolean;
  isAuthReady: boolean;
};

const ApiAuthContext = createContext<ApiAuthContextValue>({
  clerkEnabled: false,
  isAuthReady: true,
});

function ClerkApiAuthBridge({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const authStateRef = useRef({ isLoaded, isSignedIn, getToken });
  authStateRef.current = { isLoaded, isSignedIn, getToken };

  useEffect(() => {
    setAuthHeaderProvider(async () =>
      resolveClerkAuthHeaders(() => authStateRef.current),
    );
    return () => setAuthHeaderProvider(null);
  }, []);

  const value = useMemo(
    () => ({ clerkEnabled: true, isAuthReady: isLoaded }),
    [isLoaded],
  );

  return (
    <ApiAuthContext.Provider value={value}>{children}</ApiAuthContext.Provider>
  );
}

export function ApiAuthProvider({
  children,
  clerkEnabled,
}: {
  children: React.ReactNode;
  clerkEnabled: boolean;
}) {
  useEffect(() => {
    if (!clerkEnabled) {
      setAuthHeaderProvider(null);
    }
  }, [clerkEnabled]);

  if (!clerkEnabled) {
    return (
      <ApiAuthContext.Provider
        value={{ clerkEnabled: false, isAuthReady: true }}
      >
        {children}
      </ApiAuthContext.Provider>
    );
  }

  return <ClerkApiAuthBridge>{children}</ClerkApiAuthBridge>;
}

export function useApiAuth() {
  return useContext(ApiAuthContext);
}
