import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import type { ReactNode } from "react";

import { LanguageProvider } from "@/components/language-provider";
import { SiteFooter, SkipLink } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "depower: German day-ahead price forecast", template: "%s | depower" },
  description: "Forecasts of German day-ahead electricity prices, with an honest track record.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col overflow-x-clip bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <LanguageProvider>
            <SkipLink />
            <SiteHeader />
            <main id="main" tabIndex={-1} className="w-full flex-1 px-4 pt-5 pb-4 outline-none lg:px-6">
              {children}
            </main>
            <SiteFooter />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
