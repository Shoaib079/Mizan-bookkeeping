import { describe, expect, it } from "vitest";

import {
  menuPriceNote,
  menuRatePrefill,
  priceLabel,
  type MenuPricing,
} from "@/lib/menu-prefill";
import { parseFxNative } from "@/lib/fx-money";
import { parseTryToKurus } from "@/lib/money";

const vegMenu: MenuPricing = {
  name: "Veg Menu 1",
  price_minor: 1500,
  currency: "USD",
  surcharge_minor: null,
  surcharge_label: null,
};

const liraMenu: MenuPricing = {
  name: "Öğle Menüsü",
  price_minor: 35000,
  currency: "TRY",
  surcharge_minor: null,
  surcharge_label: null,
};

const cateringMenu: MenuPricing = {
  name: "Catering Menu",
  price_minor: 2700,
  currency: "USD",
  surcharge_minor: 200,
  surcharge_label: "catering charges",
};

describe("menuRatePrefill", () => {
  it("fills the rate box from the catalogue price", () => {
    expect(menuRatePrefill(vegMenu, "USD")).toBe("15,00");
  });

  it("produces text the form can parse back", () => {
    // The display format ("$15.00") cannot be parsed, so prefilling with it
    // would make every line fail validation until the symbol was deleted.
    expect(parseFxNative(menuRatePrefill(vegMenu, "USD")!)).toBe(1500);
    expect(parseTryToKurus(menuRatePrefill(liraMenu, "TRY")!)).toBe(35000);
  });

  it("leaves the box alone when the menu is priced in another currency", () => {
    // Writing "15,00" into a lira sale because the menu says $15.00 is a
    // 34-fold error that looks like a filled-in form.
    expect(menuRatePrefill(vegMenu, "TRY")).toBeNull();
  });

  it("leaves the box alone when the menu has no price", () => {
    expect(menuRatePrefill({ ...vegMenu, price_minor: null }, "USD")).toBeNull();
  });
});

describe("menuPriceNote", () => {
  it("says nothing when the line matches the catalogue", () => {
    // Otherwise every line of every sale carries a note repeating a figure
    // already on screen.
    expect(menuPriceNote(vegMenu, "USD", 1500)).toBeNull();
  });

  it("says nothing before anything has been typed", () => {
    expect(menuPriceNote(vegMenu, "USD", null)).toBeNull();
  });

  it("flags a line priced away from the catalogue", () => {
    const note = menuPriceNote(vegMenu, "USD", 1200);
    expect(note).toContain("$15.00");
    expect(note).toContain("priced differently");
  });

  it("explains a currency mismatch instead of converting", () => {
    // The app does not know what rate this agency was quoted, and inventing
    // one would be worse than saying nothing.
    const note = menuPriceNote(vegMenu, "TRY", 35000);
    expect(note).toContain("$15.00");
    expect(note).toContain("TRY");
  });

  it("mentions a surcharge even when the base price matches", () => {
    const note = menuPriceNote(cateringMenu, "USD", 2700);
    expect(note).toContain("$27.00");
    expect(note).toContain("$2.00");
    expect(note).toContain("catering charges");
  });

  it("says nothing when no menu is picked", () => {
    expect(menuPriceNote(null, "USD", 1500)).toBeNull();
  });

  it("says nothing for a menu with no price", () => {
    expect(
      menuPriceNote({ ...vegMenu, price_minor: null }, "USD", 1500),
    ).toBeNull();
  });
});

describe("priceLabel", () => {
  it("reads as money in each currency", () => {
    expect(priceLabel(1500, "USD")).toBe("$15.00");
    expect(priceLabel(35000, "TRY")).toBe("350,00 ₺");
  });
});
