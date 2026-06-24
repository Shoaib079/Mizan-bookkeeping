"use client";

import { useAuth } from "@clerk/nextjs";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";

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
  const { isLoaded, getToken } = useAuth();

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!isLoaded) return {};
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken, isLoaded]);

  useEffect(() => {
    setAuthHeaderProvider(getAuthHeaders);
    return () => setAuthHeaderProvider(null);
  }, [getAuthHeaders]);

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
