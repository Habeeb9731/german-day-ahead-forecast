"use client";

import { Button } from "@/components/ui/button";
import { getLang, saveLang, setLang } from "@/lib/i18n";

/** Shows the language a click switches to, labelled in that language. */
export function LanguageToggle() {
  const target = getLang() === "de" ? "en" : "de";
  return (
    <Button
      variant="ghost"
      size="icon"
      lang={target}
      className="size-9 text-xs font-medium text-inherit hover:bg-white/10! hover:text-inherit! focus-visible:ring-2 focus-visible:ring-accent sm:size-11"
      aria-label={target === "de" ? "Auf Deutsch anzeigen" : "Show in English"}
      onClick={() => {
        saveLang(target);
        setLang(target);
      }}
    >
      {target.toUpperCase()}
    </Button>
  );
}
