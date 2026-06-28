"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { apiFetch, setAuthHeaderProvider } from "@/lib/api";
import { useApiAuth } from "@/lib/api-auth";
import { fetchEntitiesWithRetry } from "@/lib/entity-context-helpers";

type Entity = { id: string; name: string };
type UserProfile = { id: string; email: string; display_name: string };

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
};

const EntityContext = createContext<EntityContextValue | null>(null);

const DEFAULT_ACTOR = "00000000-0000-4000-8000-000000000001";

export function EntityProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { clerkEnabled, isAuthReady } = useApiAuth();
  const [entityId, setEntityIdState] = useState("");
  const [actorId, setActorIdState] = useState(DEFAULT_ACTOR);
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

  useEffect(() => {
    setEntityIdState(localStorage.getItem("mizan.entityId") ?? "");
    setActorIdState(localStorage.getItem("mizan.actorId") ?? DEFAULT_ACTOR);
  }, []);

  const setEntityId = useCallback(
    (id: string, options?: SetEntityOptions) => {
      setEntityIdState(id);
      localStorage.setItem("mizan.entityId", id);
      if (options?.redirectToDashboard) {
        router.push("/");
      }
    },
    [router],
  );

  const setActorId = useCallback((id: string) => {
    setActorIdState(id);
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
      setEntitiesLoaded(true);
      setEntitiesError(false);
      const stored = localStorage.getItem("mizan.entityId");
      if (stored && res.items.some((e) => e.id === stored)) {
        setEntityIdState(stored);
      } else if (res.items.length === 1) {
        setEntityId(res.items[0].id);
      }
    } catch {
      setEntitiesError(true);
    } finally {
      setEntitiesLoading(false);
    }
  }, [setEntityId]);

  useEffect(() => {
    if (clerkEnabled && !isAuthReady) return;
    void refreshEntities();
  }, [clerkEnabled, isAuthReady, refreshEntities]);

  useEffect(() => {
    if (!clerkEnabled || !isAuthReady) return;
    void apiFetch<UserProfile>("/users/me")
      .then((user) => {
        setUserProfile(user);
        setActorId(user.id);
      })
      .catch(() => {
        setUserProfile(null);
      });
  }, [clerkEnabled, isAuthReady, setActorId]);

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
