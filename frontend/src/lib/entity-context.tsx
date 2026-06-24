"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type EntityContextValue = {
  entityId: string;
  setEntityId: (id: string) => void;
  actorId: string;
  setActorId: (id: string) => void;
};

const EntityContext = createContext<EntityContextValue | null>(null);

const DEFAULT_ACTOR = "00000000-0000-4000-8000-000000000001";

export function EntityProvider({ children }: { children: React.ReactNode }) {
  const [entityId, setEntityIdState] = useState("");
  const [actorId, setActorIdState] = useState(DEFAULT_ACTOR);

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

  const value = useMemo(
    () => ({ entityId, setEntityId, actorId, setActorId }),
    [entityId, setEntityId, actorId, setActorId],
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
