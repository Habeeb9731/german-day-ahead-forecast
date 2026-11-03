"use client";

import { BrainCircuit, CalendarClock, ChartLine, Info, PlugZap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

import { LanguageToggle } from "@/components/language-toggle";
import { Logo } from "@/components/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

function links() {
  return [
    { href: "/", label: t("Tomorrow"), icon: CalendarClock },
    { href: "/track-record/", label: t("Track record"), icon: ChartLine },
    { href: "/model/", label: t("Model"), icon: BrainCircuit },
    { href: "/ev-charging/", label: t("EV charging"), icon: PlugZap },
    { href: "/about/", label: t("About"), icon: Info },
  ];
}

const INDICATOR_MS = 620;
const INDICATOR_EASING = "cubic-bezier(.45,0,.2,1)";
const WOBBLE_PX = 3;

/** Moves the indicator to the active link: it stretches across the gap, overshoots slightly and
 * settles. Only the first position and reduced-motion users skip the animation. */
function moveIndicator(nav: HTMLElement, indicator: HTMLElement, fromRef: { current: number | null }) {
  const active = nav.querySelector<HTMLElement>('a[aria-current="page"]');
  if (!active) {
    indicator.style.opacity = "0";
    return;
  }
  const to = active.offsetLeft;
  const size = active.offsetWidth;
  const from = fromRef.current;
  indicator.style.top = `${active.offsetTop}px`;
  indicator.style.width = `${size}px`;
  indicator.style.height = `${size}px`;
  indicator.style.transform = `translateX(${to}px)`;
  indicator.style.opacity = "1";
  fromRef.current = to;
  if (from === null || from === to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const right = to > from;
  const span = Math.abs(to - from) + size;
  const start = right ? from : to;
  const wobble = right ? WOBBLE_PX : -WOBBLE_PX;
  indicator.getAnimations().forEach((animation) => animation.cancel());
  indicator.animate(
    [
      { transform: `translateX(${from}px)`, width: `${size}px`, height: `${size}px`, marginTop: "0px" },
      {
        transform: `translateX(${start}px)`,
        width: `${span}px`,
        height: `${size - 6}px`,
        marginTop: "3px",
        offset: 0.42,
      },
      {
        transform: `translateX(${to + wobble}px)`,
        width: `${size - 4}px`,
        height: `${size + 2}px`,
        marginTop: "-1px",
        offset: 0.72,
      },
      { transform: `translateX(${to}px)`, width: `${size}px`, height: `${size}px`, marginTop: "0px" },
    ],
    { duration: INDICATOR_MS, easing: INDICATOR_EASING },
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const normalized = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const indicatorX = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (navRef.current && indicatorRef.current) {
      moveIndicator(navRef.current, indicatorRef.current, indicatorX);
    }
  }, [normalized]);

  useLayoutEffect(() => {
    const onResize = () => {
      if (navRef.current && indicatorRef.current) {
        moveIndicator(navRef.current, indicatorRef.current, indicatorX);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <>
      {/* The brand scrolls away with the page. Only the pill stays pinned, floating over content. */}
      <header className="relative">
        <Link
          href="/"
          aria-label={t("depower home")}
          className="flex h-14 w-fit items-center px-4 md:absolute md:top-3 md:left-4 md:px-0 lg:left-6"
        >
          <Logo />
        </Link>
      </header>
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4 md:sticky md:top-3 md:bottom-auto md:mt-3">
        <nav
          ref={navRef}
          aria-label={t("Main")}
          className="pointer-events-auto relative isolate flex h-14 items-center gap-0.5 rounded-full border border-white/15 bg-black p-1.5 text-white shadow-lg sm:gap-1"
        >
          {/* Difference blending inverts each icon under the white indicator. The pill stays pure black
              in both themes, because any tint would turn the white indicator off-white. */}
          <span
            ref={indicatorRef}
            aria-hidden
            className="pointer-events-none absolute left-0 z-10 rounded-full bg-white opacity-0 mix-blend-difference"
          />
          <TooltipProvider delayDuration={150}>
            {links().map(({ href, label, icon: Icon }) => {
              const active = normalized === href;
              return (
                <Tooltip key={href}>
                  <TooltipTrigger asChild>
                    <Link
                      href={href}
                      aria-label={label}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex size-9 items-center justify-center rounded-full transition-colors sm:size-11 outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        "[&>svg]:transition-transform [&>svg]:duration-350 [&>svg]:ease-[cubic-bezier(.34,1.8,.5,1)] hover:[&>svg]:-translate-y-0.5 hover:[&>svg]:scale-110 active:[&>svg]:scale-[.88] active:[&>svg]:duration-100 motion-reduce:[&>svg]:transition-none",
                        !active && "hover:bg-white/10",
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
          <LanguageToggle />
          <ModeToggle />
        </nav>
      </div>
    </>
  );
}
