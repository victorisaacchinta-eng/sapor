import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sapor, a taste agent for your table",
  description:
    "Everyone names a film, show or artist they love. Sapor reads the taste behind them with Qloo and picks a place that suits the whole table, down to what each of you should order.",
};

export const viewport: Viewport = {
  themeColor: "#f3ecdd",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        {/* Clash Display and Satoshi by Indian Type Foundry, free for commercial use via Fontshare */}
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=satoshi@400,500,700,900&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
