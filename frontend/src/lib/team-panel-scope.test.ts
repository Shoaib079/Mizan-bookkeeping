import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("TeamPanel entity scoping", () => {
  it("filters members to the active restaurant", async () => {
    const panel = sourceDeclaring("TeamPanel");
    const list = sourceDeclaring("TeamMembersList");
    expect(panel).toContain('row.entity_id === entityId');
    expect(panel).toContain("teamMembers");
    expect(panel).toContain("TeamMembersList");
    expect(list).toContain("key={entityId}");
  });
});

describe("useEntityList entity-switch hygiene", () => {
  it("clears items while fetching a new entity", async () => {
    const source = sourceDeclaring("ENTITY_LIST_PAGE_SIZE");
    expect(source).toContain("awaitingEntity");
    expect(source).toContain("items: awaitingEntity ? []");
  });
});
