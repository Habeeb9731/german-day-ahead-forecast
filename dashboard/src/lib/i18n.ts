import type { ReactNode } from "react";

import { DE } from "./i18n-de";

/** English text is the key: t() returns it, or its German entry. A source-scanning
 * test fails if a string has no German entry, so the fallback to English is only a safety net. */

export type Lang = "en" | "de";
export type Vars = Record<string, string | number>;

const STORAGE_KEY = "language";
let current: Lang = "en";
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  listeners.forEach((listener) => listener());
}

/** Locale for number and date formatting. */
export function intlLocale(): string {
  return current === "de" ? "de-DE" : "en-GB";
}

/** The first language in the browser's preference list that the site supports, else English. */
export function detectLang(languages: readonly string[]): Lang {
  for (const language of languages) {
    const primary = language.toLowerCase().split("-")[0];
    if (primary === "de") return "de";
    if (primary === "en") return "en";
  }
  return "en";
}

/** A visitor's explicit choice wins over the browser's preference. Storage can be unavailable. */
export function readSavedLang(): Lang | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "de" || saved === "en" ? saved : null;
  } catch {
    return null;
  }
}

export function saveLang(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // The choice still applies for this visit.
  }
}

function lookup(text: string): string {
  return current === "de" ? (DE[text] ?? text) : text;
}

export function t(text: string, vars?: Vars): string {
  const translated = lookup(text);
  if (!vars) return translated;
  return translated.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Like t(), for text containing elements such as links, passed by placeholder name. */
export function tRich(text: string, parts: Record<string, ReactNode>): ReactNode[] {
  return lookup(text)
    .split(/(\{\w+\})/)
    .map((piece) => {
      const name = piece.match(/^\{(\w+)\}$/)?.[1];
      return name && name in parts ? parts[name] : piece;
    });
}
