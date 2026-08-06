/** Catalogue price → the group sale form (MENU_PLAN.md slice 5).
 *
 * The one rule this module exists to hold: **the catalogue never posts.** It
 * fills a box, and what is in the box when Save is pressed is what goes to
 * the ledger. The server does not look the price up and substitute it.
 *
 * That matters because a menu price is edited whenever prices change, and a
 * sale is a fact about a day. If the server priced the sale from the menu,
 * the same request replayed after a price rise would post a different figure,
 * and nothing on screen would have changed to say so. Pre-fill is a typing
 * aid; the number a person can see is the number that posts.
 *
 * Pure functions, no React, so the rules are tested directly.
 */

import { formatFxNative, formatFxNativeInput } from "@/lib/fx-money";
import { formatKurus } from "@/lib/money";

export type MenuPricing = {
  name: string;
  price_minor: number | null;
  currency: string;
  surcharge_minor: number | null;
  surcharge_label: string | null;
};

/** An amount as a person would read it: "₺350,00", "$15.00". */
export function priceLabel(minor: number, currency: string): string {
  if (currency === "TRY") return `${formatKurus(minor)} ₺`;
  return formatFxNative(minor, currency);
}

/** What to put in the rate box when a menu is picked.
 *
 * `null` means leave the box alone — either the menu has no price, or it is
 * priced in a currency this sale is not in. Writing "15.00" into a lira sale
 * because the menu says $15.00 would be a 34-fold error that looks like a
 * filled-in form.
 */
export function menuRatePrefill(
  menu: MenuPricing,
  saleCurrency: string,
): string | null {
  if (menu.price_minor === null) return null;
  if (menu.currency !== saleCurrency) return null;
  // The input's own format, not the display one: "$15.00" cannot be parsed
  // back and would fail validation the moment it was typed over.
  if (saleCurrency === "TRY") return formatKurus(menu.price_minor);
  return formatFxNativeInput(menu.price_minor);
}

/** The line under the rate box, or null when there is nothing worth saying.
 *
 * Deliberately a note and never a block. Agencies negotiate, and a sale at a
 * price the catalogue does not carry is an ordinary Tuesday — the app's job
 * is to make sure that was meant, not to refuse it.
 */
export function menuPriceNote(
  menu: MenuPricing | null,
  saleCurrency: string,
  typedRateMinor: number | null,
): string | null {
  if (menu === null || menu.price_minor === null) return null;

  const listed = priceLabel(menu.price_minor, menu.currency);

  if (menu.currency !== saleCurrency) {
    // No conversion offered: the app does not know the rate this agency was
    // quoted, and inventing one would be worse than saying nothing.
    return `${menu.name} is priced ${listed} — this sale is in ${saleCurrency}.`;
  }

  const surcharge =
    menu.surcharge_minor !== null
      ? ` + ${priceLabel(menu.surcharge_minor, menu.currency)}${
          menu.surcharge_label ? ` ${menu.surcharge_label}` : ""
        }`
      : "";

  if (typedRateMinor === null) {
    return surcharge ? `Menu price ${listed}${surcharge}.` : null;
  }
  if (typedRateMinor === menu.price_minor) {
    // Matches the catalogue. Repeating it back is noise on every line of
    // every sale, so the note appears only when something differs.
    return surcharge ? `Menu price ${listed}${surcharge}.` : null;
  }
  return `Menu price is ${listed}${surcharge} — this line is priced differently.`;
}
