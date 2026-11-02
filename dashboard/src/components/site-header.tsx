"use client";

import { BrainCircuit, CalendarClock, ChartLine, Info, PlugZap, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ModeToggle } from "@/components/mode-toggle";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Tomorrow", icon: CalendarClock },
  { href: "/track-record/", label: "Track record", icon: ChartLine },
  { href: "/model/", label: "Model", icon: BrainCircuit },
  { href: "/ev-charging/", label: "EV charging", icon: PlugZap },
  { href: "/about/", label: "About", icon: Info },
];

export function SiteHeader() {
  const pathname = usePathname();
  const normalized = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return (
    <>
      {/* The brand scrolls away with the page. Only the pill stays pinned, floating over content. */}
      <header className="relative">
        <Link
          href="/"
          className="absolute top-3 left-4 hidden h-14 items-center gap-2.5 lg:left-6 lg:flex"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Zap className="size-4" aria-hidden />
          </span>
          <span className="font-heading text-lg font-medium">DE-LU day-ahead forecast</span>
        </Link>
      </header>
      <div className="pointer-events-none sticky top-3 z-40 mt-3 flex justify-center px-4">
        <nav
          aria-label="Main"
          className="pointer-events-auto flex h-14 items-center gap-0.5 rounded-full border border-white/10 bg-foreground p-1.5 text-background shadow-lg sm:gap-1 dark:bg-card dark:text-foreground"
        >
          <TooltipProvider delayDuration={150}>
            {LINKS.map(({ href, label, icon: Icon }) => {
              const active = normalized === href;
              return (
                <Tooltip key={href}>
                  <TooltipTrigger asChild>
                    <Link
                      href={href}
                      aria-label={label}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex size-11 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        active
                          ? "bg-background text-foreground dark:bg-foreground dark:text-background"
                          : "hover:bg-white/10",
                      )}
                    >
                      <Icon className="size-[18px]" aria-hidden />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={8}>{label}</TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
          <Separator orientation="vertical" className="mx-1 h-6! self-center! bg-white/20 sm:mx-1.5" />
          <ModeToggle />
        </nav>
      </div>
    </>
  );
}
