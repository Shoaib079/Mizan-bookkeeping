import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("Sales page without sales summary UI", () => {
  it("does not mount SalesSummaryBlock", () => {
    const page = sourceDeclaring("SalesPage");
    expect(page).not.toContain("SalesSummaryBlock");
    expect(page).toContain("LazySalesReviewPanel");
  });

  it("mutation: SalesSummaryBlock returns on /sales → red", () => {
    const page = sourceDeclaring("SalesPage");
    expect(page).not.toContain("SalesSummaryBlock");
    const resurrected = page.replace(
      "<LazySalesReviewPanel showCreate />",
      "<><SalesSummaryBlock /><LazySalesReviewPanel showCreate /></>",
    );
    expect(resurrected).toContain("SalesSummaryBlock");
  });
});

describe("DownloadIcon shared across triggers", () => {
  it("DownloadMenu and MonthPackButton use DownloadIcon (ArrowDownToLine)", () => {
    const icon = sourceDeclaring("DownloadIcon");
    expect(icon).toContain("ArrowDownToLine");
    expect(sourceDeclaring("DownloadMenu")).toContain("DownloadIcon");
    expect(sourceDeclaring("MonthPackButton")).toContain("DownloadIcon");
    expect(sourceDeclaring("SalesReviewPanel")).toContain("DownloadIcon");
  });

  it("mutation: DownloadMenu back on lucide Download tray → red", () => {
    const menu = sourceDeclaring("DownloadMenu");
    expect(menu).toContain('from "@/components/ui/download-icon"');
    expect(menu).not.toMatch(
      /import \{[^}]*\bDownload\b[^}]*\} from "lucide-react"/,
    );
  });
});
