// @vitest-environment jsdom

/**
 * Button colour restore — secondary filled blue; positive green for profit.
 * Guards the owner list (Staff / Partner / Cash) plus mutation against
 * colourless secondary (v2 white override / muted).
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cashPageWriteHeader } from "@/components/banking/cash-page-write-actions";
import { Button } from "@/components/ui/button";
import { DownloadMenu } from "@/components/ui/download-menu";
import { grantsForRole } from "@/lib/member-grants";
import { sourceAt, sourceDeclaring } from "@/test-support/source";

vi.mock("@/lib/use-entity-access", () => ({
  useEntityAccess: () => ({
    grants: grantsForRole("owner"),
    role: "owner",
    membershipSettled: true,
    loading: false,
  }),
}));

afterEach(cleanup);

function expectFilledBlue(el: HTMLElement) {
  expect(el.className).toContain("bg-primary");
  expect(el.className).toContain("text-primary-foreground");
  expect(el.className).not.toContain("text-muted-foreground");
  expect(el.className).not.toMatch(/\bbg-transparent\b/);
  expect(el.className).not.toMatch(/\bbg-background\b/);
}

function expectPositiveGreen(el: HTMLElement) {
  expect(el.className).toContain("bg-success");
  expect(el.className).toContain("text-primary-foreground");
  expect(el.className).not.toContain("text-muted-foreground");
}

describe("owner action buttons keep sticker colours", () => {
  it("Staff Give advance (secondary) is filled blue, not muted", () => {
    render(
      <Button type="button" variant="secondary">
        Give advance
      </Button>,
    );
    expectFilledBlue(screen.getByRole("button", { name: "Give advance" }));
  });

  it("Staff/Partner Download trigger is filled blue", () => {
    render(
      <DownloadMenu items={[{ label: "Excel (.xlsx)", run: async () => {} }]} />,
    );
    expectFilledBlue(screen.getByRole("button", { name: /Download/ }));
  });

  it("Partner Pay profit is positive green", () => {
    render(
      <Button type="button" variant="positive">
        Pay profit
      </Button>,
    );
    expectPositiveGreen(screen.getByRole("button", { name: "Pay profit" }));
  });

  it("Partner Allocate profit is positive green", () => {
    render(
      <Button type="button" variant="positive">
        Allocate profit
      </Button>,
    );
    expectPositiveGreen(
      screen.getByRole("button", { name: "Allocate profit" }),
    );
  });

  it("Cash Count cash (secondary) is filled blue", () => {
    const { actions } = cashPageWriteHeader({
      entityId: "ent-1",
      showOpsWrite: true,
      showCountCash: true,
      showCloseDay: true,
      onMovement: () => {},
      onCountCash: () => {},
      onCloseDay: () => {},
      onAddDrawer: () => {},
    });
    render(<>{actions}</>);
    expectFilledBlue(screen.getByRole("button", { name: "Count cash" }));
  });
});

describe("button colour wiring (source + mutation)", () => {
  it("Partner page wires positive for Pay profit; Staff Give advance secondary", () => {
    const partnerDetail = sourceDeclaring("PartnerDetailPage");
    const partnersList = sourceDeclaring("PartnersPage");
    const staff = sourceDeclaring("StaffDetailPage");
    const download = sourceDeclaring("DownloadMenu");
    const cash = sourceDeclaring("cashPageWriteHeader");

    expect(partnerDetail).toContain('variant="positive"');
    expect(partnerDetail).toContain("Pay profit");
    expect(partnersList).toContain('variant="positive"');
    expect(partnersList).toContain("Allocate profit");
    expect(staff).toContain('variant="secondary"');
    expect(staff).toContain("Give advance");
    expect(download).toContain('variant="secondary"');
    expect(download).toContain("Download");
    expect(cash).toContain('variant="secondary"');
    expect(cash).toContain("Count cash");
  });

  it("mutation: button renders without colour classes / white secondary CSS → red", () => {
    const btn = sourceDeclaring("Button");
    expect(btn).toContain("data-button-variant={variant}");
    expect(btn).toContain("bg-primary text-primary-foreground");
    expect(btn).toContain("bg-success");
    expect(btn).toContain('variant === "positive"');

    const globals = sourceAt("app/globals.css");
    expect(globals).not.toMatch(
      /\[data-button-variant="secondary"\][\s\S]{0,160}background:\s*#ffffff\s*!important/,
    );

    // Simulated regression: secondary loses fill classes
    const stripped = btn.replace(
      /variant === "secondary" &&\s*\n\s*"bg-primary text-primary-foreground hover:bg-primary\/90"/,
      'variant === "secondary" && "text-muted-foreground"',
    );
    expect(stripped).toContain(
      'variant === "secondary" && "text-muted-foreground"',
    );
    expect(btn).not.toContain(
      'variant === "secondary" && "text-muted-foreground"',
    );
  });
});
