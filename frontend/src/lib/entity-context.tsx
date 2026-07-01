"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { apiFetch, setAuthHeaderProvider } from "@/lib/api";
import { useApiAuth } from "@/lib/api-auth";
import { fetchEntitiesWithRetry, resolveEntityIdFromList } from "@/lib/entity-context-helpers";

const DEFAULT_ACTOR = "00000000-0000-4000-8000-000000000001";

type Entity = { id: string; name: string };
type UserProfile = { id: string; email: string; display_name: string };

function readStoredEntityId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("mizan.entityId") ?? "";
}

function readStoredActorId(): string {
  if (typeof window === "undefined") return DEFAULT_ACTOR;
  return localStorage.getItem("mizan.actorId") ?? DEFAULT_ACTOR;
}

type SetEntityOptions = {
  /** Navigate to dashboard after selecting (company switch only). */
  redirectToDashboard?: boolean;
};

type EntityContextValue = {
  entityId: string;
  setEntityId: (id: string, options?: SetEntityOptions) => void;
  actorId: string;
  setActorId: (id: string) => void;
  entities: Entity[];
  entitiesLoading: boolean;
  entitiesLoaded: boolean;
  entitiesError: boolean;
  refreshEntities: () => Promise<void>;
  userProfile: UserProfile | null;
  refreshUserProfile: () => Promise<void>;
};

const EntityContext = createContext<EntityContextValue | null>(null);

export function EntityProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const { clerkEnabled, isAuthReady } = useApiAuth();
  const [entityId, setEntityIdState] = useState(readStoredEntityId);
  const [actorId, setActorIdState] = useState(readStoredActorId);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [entitiesLoaded, setEntitiesLoaded] = useState(false);
  const [entitiesError, setEntitiesError] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (clerkEnabled) return;
    setAuthHeaderProvider(async (): Promise<Record<string, string>> =>
      actorId ? { "X-User-Id": actorId } : {},
    );
    return () => setAuthHeaderProvider(null);
  }, [clerkEnabled, actorId]);

  const setEntityId = useCallback((id: string, options?: SetEntityOptions) => {
    setEntityIdState((current) => (current === id ? current : id));
    localStorage.setItem("mizan.entityId", id);
    if (options?.redirectToDashboard) {
      routerRef.current.push("/");
    }
  }, []);

  const setActorId = useCallback((id: string) => {
    setActorIdState((current) => (current === id ? current : id));
    localStorage.setItem("mizan.actorId", id);
  }, []);

  const refreshEntities = useCallback(async () => {
    setEntitiesLoading(true);
    setEntitiesError(false);
    try {
      const res = await fetchEntitiesWithRetry(() =>
        apiFetch<{ items: Entity[] }>("/entities?limit=50"),
      );
      setEntities(res.items);
      setEntitiesError(false);
      const stored = localStorage.getItem("mizan.entityId");
      setEntityIdState((current) =>
        resolveEntityIdFromList(current, res.items, stored),
      );
      const resolved = resolveEntityIdFromList(
        readStoredEntityId(),
        res.items,
        stored,
      );
      if (resolved) {
        localStorage.setItem("mizan.entityId", resolved);
      }
      setEntitiesLoaded(true);
    } catch {
      setEntitiesError(true);
      setEntitiesLoaded(true);
    } finally {
      setEntitiesLoading(false);
    }
  }, []);

  const refreshUserProfile = useCallback(async () => {
    if (!clerkEnabled || !isAuthReady) return;
    try {
      const user = await apiFetch<UserProfile>("/users/me");
      setUserProfile(user);
      setActorId(user.id);
    } catch {
      setUserProfile(null);
    }
  }, [clerkEnabled, isAuthReady, setActorId]);

  useEffect(() => {
    if (clerkEnabled && !isAuthReady) return;
    void refreshEntities();
  }, [clerkEnabled, isAuthReady, refreshEntities]);

  useEffect(() => {
    void refreshUserProfile();
  }, [refreshUserProfile]);

  const value = useMemo(
    () => ({
      entityId,
      setEntityId,
      actorId,
      setActorId,
      entities,
      entitiesLoading,
      entitiesLoaded,
      entitiesError,
      refreshEntities,
      userProfile,
      refreshUserProfile,
    }),
    [
      entityId,
      setEntityId,
      actorId,
      setActorId,
      entities,
      entitiesLoading,
      entitiesLoaded,
      entitiesError,
      refreshEntities,
      userProfile,
      refreshUserProfile,
    ],
  );

  return (
    <EntityContext.Provider value={value}>{children}</EntityContext.Provider>
  );
}

export function useEntity() {
  const ctx = useContext(EntityContext);
  if (!ctx) throw new Error("useEntity must be used within EntityProvider");
  return ctx;
}
