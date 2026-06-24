"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { apiFetch } from "@/lib/api";
import { useApiAuth } from "@/lib/api-auth";

type Entity = { id: string; name: string };
type UserProfile = { id: string; email: string; display_name: string };

type EntityContextValue = {
  entityId: string;
  setEntityId: (id: string) => void;
  actorId: string;
  setActorId: (id: string) => void;
  entities: Entity[];
  entitiesLoading: boolean;
  refreshEntities: () => Promise<void>;
};

const EntityContext = createContext<EntityContextValue | null>(null);

const DEFAULT_ACTOR = "00000000-0000-4000-8000-000000000001";

export function EntityProvider({ children }: { children: React.ReactNode }) {
  const { clerkEnabled, isAuthReady } = useApiAuth();
  const [entityId, setEntityIdState] = useState("");
  const [actorId, setActorIdState] = useState(DEFAULT_ACTOR);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);

  useEffect(() => {
    setEntityIdState(localStorage.getItem("mizan.entityId") ?? "");
    setActorIdState(localStorage.getItem("mizan.actorId") ?? DEFAULT_ACTOR);
  }, []);

  const setEntityId = useCallback((id: string) => {
    setEntityIdState(id);
    localStorage.setItem("mizan.entityId", id);
  }, []);

  const setActorId = useCallback((id: string) => {
    setActorIdState(id);
    localStorage.setItem("mizan.actorId", id);
  }, []);

  const refreshEntities = useCallback(async () => {
    setEntitiesLoading(true);
    try {
      const res = await apiFetch<{ items: Entity[] }>("/entities?limit=50");
      setEntities(res.items);
      const stored = localStorage.getItem("mizan.entityId");
      if (stored && res.items.some((e) => e.id === stored)) {
        setEntityIdState(stored);
      } else if (res.items.length === 1) {
        setEntityId(res.items[0].id);
      }
    } catch {
      setEntities([]);
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
      .then((user) => setActorId(user.id))
      .catch(() => undefined);
  }, [clerkEnabled, isAuthReady, setActorId]);

  const value = useMemo(
    () => ({
      entityId,
      setEntityId,
      actorId,
      setActorId,
      entities,
      entitiesLoading,
      refreshEntities,
    }),
    [
      entityId,
      setEntityId,
      actorId,
      setActorId,
      entities,
      entitiesLoading,
      refreshEntities,
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
