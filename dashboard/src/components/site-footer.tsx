"use client";

import { t, tRich } from "@/lib/i18n";

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only rounded-md bg-background px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:ring-2 focus:ring-ring"
    >
      {t("Skip to content")}
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer>
      <div className="w-full space-y-1 px-4 py-4 text-xs text-muted-foreground lg:px-6">
        <p>
          {tRich(
            "Market data: Bundesnetzagentur | SMARD.de (CC BY 4.0). Weather data by {link} (CC BY 4.0). Data modified. See About.",
            {
              link: (
                <a
                  key="link"
                  className="underline underline-offset-2"
                  href="https://open-meteo.com/"
                  rel="noreferrer"
                  target="_blank"
                >
                  Open-Meteo.com
                </a>
              ),
            },
          )}
        </p>
        <p>{t("Wholesale prices, not retail tariffs. Not financial advice.")}</p>
      </div>
    </footer>
  );
}
