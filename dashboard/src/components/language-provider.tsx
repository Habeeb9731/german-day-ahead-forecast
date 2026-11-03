"use client";

import { usePathname } from "next/navigation";
import { Fragment, type ReactNode, useLayoutEffect, useSyncExternalStore } from "react";

import { detectLang, getLang, readSavedLang, setLang, subscribeLang } from "@/lib/i18n";

/** The prerendered page is English. After hydration this switches to the visitor's language, then
 * remounts the page so that every translated string and formatted number updates. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, getLang, () => "en" as const);

  useLayoutEffect(() => {
    setLang(readSavedLang() ?? detectLang(navigator.languages ?? [navigator.language]));
  }, []);

  useLayoutEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Each page gets its own entrance. useEntranceWindow switches motion off again once it has played.
  const pathname = usePathname();
  useLayoutEffect(() => {
    document.documentElement.removeAttribute("data-entered");
  }, [pathname]);

  return <Fragment key={lang}>{children}</Fragment>;
}
