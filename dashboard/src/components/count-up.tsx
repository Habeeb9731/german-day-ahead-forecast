"use client";

import { useEffect, useState } from "react";

const DURATION_MS = 700;
const START_FRACTION = 0.7;

function shouldAnimate(): boolean {
  return (
    typeof window !== "undefined" &&
    !document.documentElement.hasAttribute("data-entered") &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** A number that counts up once on page load, then simply follows its value, so an input change
 * updates it instantly. It starts partway rather than at zero, and reserves its final width so that
 * nothing beside it moves. Screen readers only ever get the real value. */
export function CountUp({ value, format }: { value: number; format: (value: number) => string }) {
  const [start] = useState(shouldAnimate);
  const [progress, setProgress] = useState(start ? 0 : 1);

  useEffect(() => {
    if (!start) return;
    const began = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const done = Math.min(1, (now - began) / DURATION_MS);
      setProgress(done);
      if (done < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [start]);

  const eased = 1 - (1 - progress) ** 3;
  const shown = progress >= 1 ? value : value * (START_FRACTION + (1 - START_FRACTION) * eased);
  return (
    <>
      <span aria-hidden className="inline-grid">
        <span className="invisible col-start-1 row-start-1">{format(value)}</span>
        <span data-count className="col-start-1 row-start-1">{format(shown)}</span>
      </span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
