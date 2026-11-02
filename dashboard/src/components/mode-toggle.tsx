"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

/** One click switches between light and dark, starting from the visitor's system setting. */
export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="group/mode relative size-11 text-inherit hover:bg-black/5! hover:text-inherit! dark:hover:bg-white/10! focus-visible:ring-2 focus-visible:ring-accent"
      aria-label="Toggle dark mode"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <span className="relative block size-[18px] transition-transform duration-350 ease-[cubic-bezier(.34,1.8,.5,1)] group-hover/mode:scale-110 group-hover/mode:-rotate-[24deg] group-active/mode:scale-[.88] motion-reduce:transition-none">
        <Sun className="absolute inset-0 size-[18px]! scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" aria-hidden />
        <Moon className="absolute inset-0 size-[18px]! scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" aria-hidden />
      </span>
    </Button>
  );
}
