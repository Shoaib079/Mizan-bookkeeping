import type { MetadataRoute } from "next";

/** Web app manifest — what a phone uses when the app is added to a home
 * screen, and what a desktop browser uses to install it.
 *
 * Without this, "Add to Home Screen" on Android produced a screenshot of the
 * page as the icon and the browser's own chrome as the shell. iOS reads
 * `apple-icon.png` instead, which sits beside this file; both are needed
 * because the two platforms disagree about where to look.
 *
 * `display: standalone` opens without the browser address bar, which matters
 * for something a person uses at a counter rather than browses.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mizan — Restaurant bookkeeping",
    short_name: "Mizan",
    description:
      "Daily books for a restaurant: sales, expenses, suppliers, staff and partners.",
    start_url: "/",
    display: "standalone",
    // The brand off-white, not the app background: this is the splash colour
    // shown before the first paint, so it should read as the logo's backdrop.
    background_color: "#FFFDFB",
    // Matches --primary, so the Android status bar continues the app.
    theme_color: "#2563eb",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        // "any" rather than "maskable": the icon has its own margins and a
        // maskable declaration would let Android crop into the discs.
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
