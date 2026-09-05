// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  MobileShellTitleProvider,
  useMobileShellTitle,
  useRegisterMobileShellTitle,
} from "@/lib/mobile-shell-title";
import { sourceDeclaring } from "@/test-support/source";

afterEach(cleanup);

function Probe() {
  const title = useMobileShellTitle();
  return <p data-testid="shell-title">{title ?? "none"}</p>;
}

function Register({ title }: { title: string }) {
  useRegisterMobileShellTitle(title);
  return null;
}

describe("mobile shell title", () => {
  it("PageHeader registration surfaces in the provider", () => {
    render(
      <MobileShellTitleProvider>
        <Register title="Bank statement" />
        <Probe />
      </MobileShellTitleProvider>,
    );
    expect(screen.getByTestId("shell-title").textContent).toBe(
      "Bank statement",
    );
  });

  it("clears when the registering page unmounts", () => {
    const { rerender } = render(
      <MobileShellTitleProvider>
        <Register title="More" />
        <Probe />
      </MobileShellTitleProvider>,
    );
    expect(screen.getByTestId("shell-title").textContent).toBe("More");
    rerender(
      <MobileShellTitleProvider>
        <Probe />
      </MobileShellTitleProvider>,
    );
    expect(screen.getByTestId("shell-title").textContent).toBe("none");
  });

  it("AppShell wraps the mobile branch in MobileShellTitleProvider", () => {
    const src = sourceDeclaring("AppShell");
    expect(src).toContain("MobileShellTitleProvider");
    expect(src).not.toContain("useRegisterMobileShellTitle");
  });
});
