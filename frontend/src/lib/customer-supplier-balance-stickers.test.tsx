/** Supplier + customer balance stickers — direction, colour, no raw minus. */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { EntityBalanceSticker } from "@/components/entity-balance-sticker";
import { HeadlineFigure } from "@/components/page/summary-panel";
import {
  customerBalanceHeading,
  customerBalanceStickerMinor,
  customerDirectoryBalanceLabel,
} from "@/lib/customer-balance";
import {
  supplierDirectoryBalanceLabel,
  supplierBalanceHeading,
} from "@/lib/supplier-balance";
import { sourceDeclaring } from "@/test-support/source";

function stickerMarkup(label: string, signedMinor: number) {
  return renderToStaticMarkup(
    <EntityBalanceSticker label={label} signedBalanceMinor={signedMinor} />,
  );
}

describe("supplier directory balance sticker", () => {
  it("positive total uses Total payables and you-owe colour", () => {
    expect(supplierDirectoryBalanceLabel(1_195_278_24)).toBe("Total payables");
    expect(supplierBalanceHeading(1_195_278_24)).toBe("You owe supplier");
    const html = stickerMarkup(
      supplierDirectoryBalanceLabel(1_195_278_24),
      1_195_278_24,
    );
    expect(html).toContain("Total payables");
    expect(html).toContain("1.195.278,24");
    expect(html).not.toMatch(/tabular-nums[^>]*>\s*-/);
    expect(html).toContain('data-direction="company_owes"');
    expect(html).toContain("text-lg font-semibold");
  });

  it("negative total uses supplier-owes-you wording and they-owe colour", () => {
    expect(supplierDirectoryBalanceLabel(-1_195_278_24)).toBe(
      "Supplier owes you",
    );
    const html = stickerMarkup(
      supplierDirectoryBalanceLabel(-1_195_278_24),
      -1_195_278_24,
    );
    expect(html).toContain("Supplier owes you");
    expect(html).toContain("1.195.278,24");
    expect(html).not.toMatch(/-\s*1/);
    expect(html).toContain('data-direction="they_owe"');
  });

  it("zero total uses settled wording and muted colour", () => {
    expect(supplierDirectoryBalanceLabel(0)).toBe("Settled");
    const html = stickerMarkup(supplierDirectoryBalanceLabel(0), 0);
    expect(html).toContain("Settled");
    expect(html).toContain('data-direction="settled"');
    expect(html).toContain("bg-muted");
  });
});

describe("customer receivable balance sticker", () => {
  it("zero uses Nothing outstanding and settled colour", () => {
    expect(customerBalanceHeading(0)).toBe("Nothing outstanding");
    const html = stickerMarkup(
      customerBalanceHeading(0),
      customerBalanceStickerMinor(0),
    );
    expect(html).toContain("Nothing outstanding");
    expect(html).toContain('data-direction="settled"');
  });

  it("positive receivable uses customer-owes-you wording and they-owe colour", () => {
    expect(customerBalanceHeading(50_000)).toBe("Customer owes you");
    const html = stickerMarkup(
      customerBalanceHeading(50_000),
      customerBalanceStickerMinor(50_000),
    );
    expect(html).toContain("Customer owes you");
    expect(html).toContain("500,00");
    expect(html).not.toMatch(/tabular-nums[^>]*>\s*-/);
    expect(html).toContain('data-direction="they_owe"');
  });

  it("negative receivable uses you-owe-customer wording and company-owes colour", () => {
    expect(customerBalanceHeading(-25_000)).toBe("You owe customer");
    const html = stickerMarkup(
      customerBalanceHeading(-25_000),
      customerBalanceStickerMinor(-25_000),
    );
    expect(html).toContain("You owe customer");
    expect(html).toContain("250,00");
    expect(html).not.toContain("-250");
    expect(html).toContain('data-direction="company_owes"');
  });

  it("directory total keeps Total receivable when net positive", () => {
    expect(customerDirectoryBalanceLabel(100_000)).toBe("Total receivable");
    expect(customerDirectoryBalanceLabel(-100)).toBe("You owe customer");
  });
});

describe("supplier directory sticker mutation guard", () => {
  it("mutation: HeadlineFigure with signed total renders minus", () => {
    const bad = renderToStaticMarkup(
      <HeadlineFigure label="Total payables" amountKurus={-100_000} />,
    );
    expect(bad).toContain("-");
  });

  it("suppliers page uses EntityBalanceSticker not raw signed HeadlineFigure", () => {
    const src = sourceDeclaring("SuppliersPage");
    expect(src).toContain("EntityBalanceSticker");
    expect(src).toContain("supplierDirectoryBalanceLabel");
    expect(src).not.toContain("<HeadlineFigure");
    expect(src).not.toContain("amountKurus={balancesState.totalKurus}");
  });
});
