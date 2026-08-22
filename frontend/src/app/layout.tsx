import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/app/providers";
import { ThemeRoot } from "@/components/layout/theme-root";
import { THEME_V2_ATTR } from "@/lib/theme-v2";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Mizan",
  description: "Restaurant bookkeeping",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

const htmlThemeAttr =
  process.env.NEXT_PUBLIC_DEFAULT_THEME === "v2"
    ? ({ "data-theme": THEME_V2_ATTR } as const)
    : {};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning {...htmlThemeAttr}>
      <body className={`${inter.variable} font-sans`}>
        <ThemeRoot />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
