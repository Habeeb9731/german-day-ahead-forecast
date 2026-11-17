"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/* depower's mascot: a small helmeted robot with a lightning-bolt badge, in the brand blue (#2563eb). Its face follows the
 * cursor, its head tilts toward it, and it blinks now and then. Drawn in SVG with layered
 * gradients for a soft, matte 3D look. */
export function DepowerBot({ className, waving = false }: { className?: string; waving?: boolean }) {
  const root = useRef<SVGSVGElement>(null);
  const face = useRef<SVGGElement>(null);
  const head = useRef<SVGGElement>(null);
  const eyes = useRef<SVGGElement>(null);

  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let target: { x: number; y: number } | null = null;

    const look = () => {
      frame = 0;
      if (!target || !face.current || !head.current) return;
      const box = svg.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height * 0.36;
      const dx = target.x - cx;
      const dy = target.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const r = Math.min(4, d / 40);
      face.current.setAttribute("transform", `translate(${((dx / d) * r).toFixed(2)} ${((dy / d) * r * 0.8).toFixed(2)})`);
      const tilt = Math.max(-7, Math.min(7, dx / 60));
      head.current.style.transform = `rotate(${tilt.toFixed(2)}deg)`;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      target = { x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(look);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    // On touch screens there is no cursor, so it glances around now and then.
    let glance: ReturnType<typeof setInterval> | undefined;
    if (!window.matchMedia("(pointer: fine)").matches && !still) {
      glance = setInterval(() => {
        if (document.hidden) return;
        const box = svg.getBoundingClientRect();
        target = { x: box.left + (Math.random() - 0.6) * 500, y: box.top + (Math.random() - 0.7) * 400 };
        look();
      }, 2800);
    }

    let blinkTimer: ReturnType<typeof setTimeout> | undefined;
    const blink = () => {
      blinkTimer = setTimeout(() => {
        eyes.current?.classList.add("is-blinking");
        setTimeout(() => {
          eyes.current?.classList.remove("is-blinking");
          blink();
        }, 140);
      }, 2400 + Math.random() * 3600);
    };
    if (!still) blink();

    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
      if (glance) clearInterval(glance);
      if (blinkTimer) clearTimeout(blinkTimer);
    };
  }, []);

  return (
    <svg ref={root} viewBox="0 0 120 142" className={cn("depower-bot overflow-visible", waving && "is-waving", className)} aria-hidden>
      <defs>
        <radialGradient id="dbShell" cx="0.38" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#eef2fb" />
          <stop offset="1" stopColor="#c9d4ec" />
        </radialGradient>
        <radialGradient id="dbVisor" cx="0.42" cy="0.32" r="0.78">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="0.5" stopColor="#2563eb" />
          <stop offset="1" stopColor="#1e3a8a" />
        </radialGradient>
        <radialGradient id="dbBlue" cx="0.38" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="0.55" stopColor="#2563eb" />
          <stop offset="1" stopColor="#1d4ed8" />
        </radialGradient>
        <filter id="dbSoft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      {/* Body */}
      <g className="db-body">
        <rect x="45" y="118" width="13" height="17" rx="5" fill="url(#dbBlue)" />
        <rect x="62" y="118" width="13" height="17" rx="5" fill="url(#dbBlue)" />
        <ellipse cx="37" cy="106" rx="8" ry="10" fill="url(#dbBlue)" transform="rotate(14 37 106)" />
        <rect x="39" y="88" width="42" height="36" rx="17" fill="url(#dbShell)" />
        <circle cx="60" cy="104" r="9.5" fill="url(#dbBlue)" />

        <path d="M61.6 97.2 55.6 105.2h4.2l-1.6 6.6 6-8.2h-4.3z" fill="#fff" />
      </g>

      {/* Head */}
      <g ref={head} className="db-head">
        <ellipse cx="40" cy="17" rx="9.5" ry="12" fill="url(#dbShell)" transform="rotate(-12 40 17)" />
        <ellipse cx="80" cy="17" rx="9.5" ry="12" fill="url(#dbShell)" transform="rotate(12 80 17)" />
        <ellipse cx="16" cy="54" rx="10" ry="17" fill="url(#dbBlue)" />
        <ellipse cx="104" cy="54" rx="10" ry="17" fill="url(#dbBlue)" />
        <rect x="16" y="12" width="88" height="80" rx="36" fill="url(#dbShell)" />
        <rect x="25" y="24" width="70" height="58" rx="26" fill="url(#dbVisor)" />
        <ellipse cx="44" cy="34" rx="16" ry="6" fill="#fff" opacity=".28" filter="url(#dbSoft)" />
        <g ref={face}>
          <g ref={eyes} className="db-eyes">
            <rect x="44" y="45" width="6" height="13" rx="3" fill="#fff" />
            <rect x="70" y="45" width="6" height="13" rx="3" fill="#fff" />
          </g>
          <path d="M55 64.5q2.5 3.2 5 0q2.5 3.2 5 0" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>

      {/* Drawn last so the waving arm stays in front of the helmet. */}
      {/* The right arm waves from the shoulder. */}
        <g className="db-arm">
          <ellipse cx="83" cy="106" rx="8" ry="10" fill="url(#dbBlue)" transform="rotate(-14 83 106)" />
        </g>
    </svg>
  );
}
