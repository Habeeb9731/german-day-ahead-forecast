"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

/** One click switches between light and dark, starting in light and remembering the choice. The
 * icon shows the theme a click switches to: a moon in light mode and a sun in dark mode. */
export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="group/mode relative size-9 text-inherit sm:size-11 hover:bg-white/10! hover:text-inherit! focus-visible:ring-2 focus-visible:ring-accent"
      aria-label={t("Toggle dark mode")}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <span className="relative block size-[18px] transition-transform duration-350 ease-[cubic-bezier(.34,1.8,.5,1)] group-hover/mode:scale-110 group-hover/mode:-rotate-[24deg] group-active/mode:scale-[.88] motion-reduce:transition-none">
        <Moon className="absolute inset-0 size-[18px]! scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" aria-hidden />
        <Sun className="absolute inset-0 size-[18px]! scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" aria-hidden />
      </span>
    </Button>
  );
}
