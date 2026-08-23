// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PageHeader } from "@/components/page/page-header";
import { sourceDeclaring } from "@/test-support/source";

afterEach(cleanup);

describe("PageHeader — one bold title", () => {
  it("renders exactly one title element; muted eyebrow absent", () => {
    render(<PageHeader title="Dashboard" />);

    expect(screen.getByTestId("page-header")).toBeTruthy();
    expect(screen.getByTestId("page-header-title").tagName).toBe("H1");
    expect(screen.getByTestId("page-header-title").textContent).toBe(
      "Dashboard",
    );
    expect(screen.queryByTestId("page-eyebrow")).toBeNull();
    expect(screen.queryByTestId("page-header-eyebrow")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("mutation: eyebrow reappears above the H1 in PageHeader → red", () => {
    const src = sourceDeclaring("PageHeader");
    expect(src).toContain('data-testid="page-header-title"');
    expect(src).toContain("One bold title only");
    expect(src).not.toContain("page-eyebrow");
    expect(src).not.toContain("page-header-eyebrow");
    // Must not render a muted line before the H1 again.
    expect(src).not.toMatch(
      /text-xs text-muted-foreground[\s\S]{0,120}<h1/,
    );
    expect(src).not.toMatch(
      /eyebrow[\s\S]{0,80}\{title\}/,
    );
  });
});
