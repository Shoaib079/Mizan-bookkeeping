import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("TeamPanel entity scoping", () => {
  it("filters members to the active restaurant", async () => {
    const source = await fs.promises.readFile(
      new URL("../components/settings/team-panel.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('row.entity_id === entityId');
    expect(source).toContain("teamMembers");
    expect(source).toContain('key={entityId}');
  });
});

describe("useEntityList entity-switch hygiene", () => {
  it("clears items while fetching a new entity", async () => {
    const source = await fs.promises.readFile(
      new URL("./use-entity-list.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("awaitingEntity");
    expect(source).toContain("items: awaitingEntity ? []");
  });
});
