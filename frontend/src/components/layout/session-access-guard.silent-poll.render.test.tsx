// @vitest-environment jsdom

/**
 * Silent membership poll — unchanged payloads must not flash the app.
 */

import {
  cleanup,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { useEffect } from "react";

import { sourceDeclaring } from "@/test-support/source";

const apiFetch = vi.fn();
const toast = vi.fn();
const signOut = vi.fn(async () => undefined);
const routerReplace = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  setAuthHeaderProvider: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  useApiAuth: () => ({
    clerkEnabled: true,
    isAuthReady: true,
  }),
}));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}));

vi.mock("@/lib/toast", () => ({
  useToast: () => ({ toast }),
}));

import { EntityProvider, useEntity } from "@/lib/entity-context";
import {
  EntityAccessProvider,
  useEntityAccess,
} from "@/lib/use-entity-access";
import { SessionAccessGuard } from "@/components/layout/session-access-guard";
import {
  MEMBERSHIP_SYNC_POLL_MS,
} from "@/lib/session-access";

const MEMBERSHIP = {
  role: "owner" as const,
  permissions: ["admin:manage_members"],
  grants: ["nav:dashboard", "admin:manage_members", "scope:switch_entity"],
};

const ENTITIES = { items: [{ id: "ent-1", name: "Kitchen" }] };

function LoadingBanner() {
  const { entitiesLoading } = useEntity();
  return entitiesLoading ? (
    <p data-testid="loading-banner">Loading restaurants…</p>
  ) : (
    <p data-testid="ready-banner">ready</p>
  );
}

function AccessConsumer() {
  const { role, grants, loading } = useEntityAccess();
  return (
    <div
      data-testid="access-consumer"
      data-role={role}
      data-grants={grants.join(",")}
      data-loading={loading ? "1" : "0"}
    />
  );
}

function MountProbe({ onMount }: { onMount: () => void }) {
  useEffect(() => {
    onMount();
  }, [onMount]);
  return <div data-testid="mount-probe">alive</div>;
}

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
  toast.mockReset();
  signOut.mockReset();
  routerReplace.mockReset();
  vi.useRealTimers();
  localStorage.clear();
});

beforeEach(() => {
  localStorage.setItem("mizan.entityId", "ent-1");
  apiFetch.mockImplementation(async (path: string) => {
    const p = String(path);
    if (p.includes("/members/me")) return { ...MEMBERSHIP, grants: [...MEMBERSHIP.grants] };
    if (p.startsWith("/entities")) return { items: [...ENTITIES.items] };
    if (p.includes("/users/me")) {
      return { id: "u1", email: "a@b.c", display_name: "Ada" };
    }
    return {};
  });
});

describe("silent membership poll", () => {
  it("unchanged /members/me + /entities ticks do not flip loading or remount children", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let mountCount = 0;
    let accessRenders = 0;

    function CountingAccess() {
      accessRenders += 1;
      return <AccessConsumer />;
    }

    render(
      <EntityProvider>
        <EntityAccessProvider>
          <SessionAccessGuard />
          <LoadingBanner />
          <CountingAccess />
          <MountProbe onMount={() => {
            mountCount += 1;
          }}
          />
        </EntityAccessProvider>
      </EntityProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready-banner")).toBeTruthy();
      expect(screen.getByTestId("access-consumer").dataset.role).toBe("owner");
    });

    const mountsAfterLoad = mountCount;
    const rendersAfterLoad = accessRenders;
    const meCallsAfterLoad = apiFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/members/me"),
    ).length;

    expect(screen.queryByTestId("loading-banner")).toBeNull();

    // Two poll intervals with identical payloads.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MEMBERSHIP_SYNC_POLL_MS);
      await vi.advanceTimersByTimeAsync(50);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MEMBERSHIP_SYNC_POLL_MS);
      await vi.advanceTimersByTimeAsync(50);
    });

    await waitFor(() => {
      const meCalls = apiFetch.mock.calls.filter((c) =>
        String(c[0]).includes("/members/me"),
      ).length;
      expect(meCalls).toBeGreaterThan(meCallsAfterLoad + 1);
    });

    expect(screen.queryByTestId("loading-banner")).toBeNull();
    expect(screen.getByTestId("ready-banner")).toBeTruthy();
    expect(screen.getByTestId("mount-probe")).toBeTruthy();
    expect(mountCount).toBe(mountsAfterLoad);
    // Context identity stable → consumer should not re-render from poll alone.
    expect(accessRenders).toBe(rendersAfterLoad);
    expect(screen.getByTestId("access-consumer").dataset.loading).toBe("0");
  });

  it("changed role on a later poll still fires the toast", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(
      <EntityProvider>
        <EntityAccessProvider>
          <SessionAccessGuard />
          <AccessConsumer />
        </EntityAccessProvider>
      </EntityProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("access-consumer").dataset.role).toBe("owner");
    });

    apiFetch.mockImplementation(async (path: string) => {
      const p = String(path);
      if (p.includes("/members/me")) {
        return {
          role: "cashier",
          permissions: [],
          grants: ["nav:dashboard", "operations:write"],
        };
      }
      if (p.startsWith("/entities")) return { items: [...ENTITIES.items] };
      if (p.includes("/users/me")) {
        return { id: "u1", email: "a@b.c", display_name: "Ada" };
      }
      return {};
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MEMBERSHIP_SYNC_POLL_MS);
      await vi.advanceTimersByTimeAsync(100);
    });

    await waitFor(() => {
      expect(screen.getByTestId("access-consumer").dataset.role).toBe(
        "cashier",
      );
    });
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("Your access was updated"),
      "success",
    );
  });
});

describe("silent poll wiring (source)", () => {
  it("SessionAccessGuard polls with silent reload + silent refreshEntities", () => {
    const src = sourceDeclaring("SessionAccessGuardClerk");
    expect(src).toContain("reloadAccess({ silent: true })");
    expect(src).toContain("refreshEntities({ silent: true })");
    expect(src).toContain("MEMBERSHIP_SYNC_POLL_MS");
    expect(src).toMatch(/setInterval\([\s\S]*MEMBERSHIP_SYNC_POLL_MS/);
  });

  it("mutation: per-tick loading flip or non-silent entity refresh → red", () => {
    const guard = sourceDeclaring("SessionAccessGuardClerk");
    const entities = sourceDeclaring("EntityProvider");
    const access = sourceDeclaring("EntityAccessProvider");

    expect(guard).not.toMatch(/refreshEntities\(\s*\)/);
    expect(guard).not.toMatch(/reloadAccess\(\s*\)/);
    expect(entities).toContain("options?.silent");
    expect(entities).toMatch(/if\s*\(!silent\)\s*\{[\s\S]*setEntitiesLoading\(true\)/);
    expect(access).toContain("grantsEqual");
    expect(access).toContain("if (!silent) setLoading(true)");
  });
});
