import { describe, expect, it } from "vitest";

import { sourceAt, sourceDeclaring } from "@/test-support/source";

describe("nav-sections split", () => {
  it("barrel re-exports sections, registry, and path helpers", () => {
    const barrel = sourceAt("lib/nav-sections.ts");
    expect(barrel).toContain('from "@/lib/nav-sections-data"');
    expect(barrel).toContain('from "@/lib/nav-route-registry"');
    expect(barrel).toContain('from "@/lib/nav-path-helpers"');
    expect(barrel).toContain("NAV_SECTIONS");
    expect(barrel).toContain("REGISTERED_PAGE_ROUTES");
    expect(barrel).toContain("backLinkForPathname");
  });

  it("data module owns NAV_SECTIONS; helpers own path matchers", () => {
    expect(sourceDeclaring("NAV_SECTIONS")).toContain("id: \"sales\"");
    expect(sourceDeclaring("backLinkForPathname")).toContain(
      "/banking/statements/",
    );
    expect(sourceDeclaring("REGISTERED_PAGE_ROUTES")).toContain(
      "/sign-in/[[...sign-in]]",
    );
  });
});
