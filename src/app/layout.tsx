import type { Metadata, Viewport } from "next";
import "./globals.css";
import { INTRO_LINES } from "@/components/lines";

export const metadata: Metadata = {
  title: "Sapor: savour the same place",
  description:
    "Everyone names a film, show or artist they love. Sapor reads the taste behind them with Qloo and picks a place that suits the whole table, down to what each of you should order.",
};

export const viewport: Viewport = {
  themeColor: "#f3ecdd",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        {/* picks this load's intro line before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.intro=String(Math.floor(Math.random()*${INTRO_LINES.length}))}catch(e){}`,
          }}
        />
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
