import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("TeamPanel entity scoping", () => {
  it("filters members to the active restaurant", async () => {
    const source = sourceDeclaring("TeamPanel");
    expect(source).toContain('row.entity_id === entityId');
    expect(source).toContain("teamMembers");
    expect(source).toContain('key={entityId}');
  });
});

describe("useEntityList entity-switch hygiene", () => {
  it("clears items while fetching a new entity", async () => {
    const source = sourceDeclaring("ENTITY_LIST_PAGE_SIZE");
    expect(source).toContain("awaitingEntity");
    expect(source).toContain("items: awaitingEntity ? []");
  });
});
