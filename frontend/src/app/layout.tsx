import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { EntityProvider } from "@/lib/entity-context";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Mizan",
  description: "Restaurant bookkeeping",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans`}>
        <EntityProvider>{children}</EntityProvider>
      </body>
    </html>
  );
}
