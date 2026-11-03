"use client";

import { useEffect } from "react";

const ENTRANCE_MS = 1500;

/** Starts the entrance window once a page's content is on screen, so slow data can't cut animations
 * off partway. When it ends, motion is switched off and later re-renders never replay it. */
export function useEntranceWindow(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(
      () => document.documentElement.setAttribute("data-entered", ""),
      ENTRANCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [ready]);
}
