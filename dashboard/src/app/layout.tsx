import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "DE-LU day-ahead forecast", template: "%s | DE-LU day-ahead forecast" },
  description: "Forecasts of German day-ahead electricity prices, with an honest track record.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col overflow-x-clip bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <a
            href="#main"
            className="sr-only rounded-md bg-background px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:ring-2 focus:ring-ring"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none">
            {children}
          </main>
          <footer className="border-t">
            <div className="mx-auto w-full max-w-6xl space-y-1 px-4 py-4 text-xs text-muted-foreground">
              <p>
                Market data: Bundesnetzagentur | SMARD.de (CC BY 4.0). Weather data by{" "}
                <a className="underline underline-offset-2" href="https://open-meteo.com/" rel="noreferrer" target="_blank">
                  Open-Meteo.com
                </a>{" "}
                (CC BY 4.0). Data modified. See About.
              </p>
              <p>Wholesale prices, not retail tariffs. Not financial advice.</p>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
