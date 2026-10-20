import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sapor, a taste agent for your table",
  description:
    "Everyone names a film, show or artist they love. Sapor reads the taste behind them with Qloo and picks a place that suits the whole table, down to what each of you should order.",
};

export const viewport: Viewport = {
  themeColor: "#E3EBE1",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={fraunces.variable}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        {/* Switzer by Indian Type Foundry, free for commercial use via Fontshare */}
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
