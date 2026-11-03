import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { detectLang, getLang, setLang, t, tRich } from "./i18n";
import { DE } from "./i18n-de";
import { eur, fmt, LABEL_STRINGS, modelLabel, pct, regimeLabel } from "./labels";
import { dateLabel, dateTimeLabel, hourLabel, shortDateLabel } from "./time";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "ui" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

/** Every string passed to t() or tRich() in the source, including both sides of a conditional. */
function collectStrings(): string[] {
  const found = new Set<string>(LABEL_STRINGS);
  // Passed to t() through a variable in the home page's highest and lowest tiles.
  found.add("Highest at {hour}");
  found.add("Lowest at {hour}");
  const call = /\bt(?:Rich)?\(\s*(?:[\w.!= >-]+\?\s*)?"((?:[^"\\]|\\.)*)"(?:\s*:\s*"((?:[^"\\]|\\.)*)")?/g;
  for (const file of sourceFiles("src")) {
    for (const match of readFileSync(file, "utf8").matchAll(call)) {
      if (match[1]) found.add(match[1].replace(/\\"/g, '"'));
      if (match[2]) found.add(match[2].replace(/\\"/g, '"'));
    }
  }
  return [...found].sort();
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => setLang("en"));

describe("detectLang", () => {
  it.each([
    [["de"], "de"],
    [["de-AT", "en"], "de"],
    [["en-US", "de"], "en"],
    [["fr-FR", "de-DE", "en"], "de"],
    [["fr-FR", "en-GB", "de"], "en"],
    [["fr-FR"], "en"],
    [["ja", "ko"], "en"],
    [[], "en"],
  ])("%j gives %s", (languages, expected) => {
    expect(detectLang(languages)).toBe(expected);
  });
});

describe("German translations", () => {
  const strings = collectStrings();

  it("finds the source strings", () => {
    expect(strings.length).toBeGreaterThan(150);
    expect(strings).toContain("Average price");
    expect(strings).toContain("Backtest rolling {n}-day MAE");
    expect(strings).toContain("Rolling {n}-day MAE");
  });

  it("has an entry for every string", () => {
    expect(strings.filter((s) => !DE[s])).toEqual([]);
  });

  it("has no entries for strings that no longer exist", () => {
    expect(Object.keys(DE).filter((s) => !strings.includes(s))).toEqual([]);
  });

  it("keeps every placeholder", () => {
    const broken = strings.filter((s) => DE[s] && placeholders(s).join() !== placeholders(DE[s]).join());
    expect(broken).toEqual([]);
  });

  it("keeps the required attribution and units unchanged", () => {
    for (const s of strings) {
      if (!DE[s]) continue;
      for (const term of ["Bundesnetzagentur | SMARD.de", "CC BY 4.0", "EUR/MWh", "ct/kWh", "P10", "P50", "P90", "MAE"]) {
        if (s.includes(term)) expect(DE[s], s).toContain(term);
      }
    }
    expect(DE["Weather data by Open-Meteo.com"]).toContain("Open-Meteo.com");
  });

  it("keeps the disclaimers meaningful", () => {
    expect(DE["Not financial advice"]).toMatch(/Anlageberatung|Finanzberatung/);
    expect(DE["Uses wholesale prices and excludes taxes, grid fees and supplier charges."]).toMatch(/Steuern/);
    expect(DE["Uses wholesale prices and excludes taxes, grid fees and supplier charges."]).toMatch(/Netzentgelte/);
  });
});

describe("formatting follows the language", () => {
  it("formats numbers", () => {
    expect(fmt(1234.5)).toBe("1,234.50");
    setLang("de");
    expect(fmt(1234.5)).toBe("1.234,50");
  });

  it("formats euros, including negatives", () => {
    expect(eur(-0.17)).toBe("−€0.17");
    expect(eur(6.34)).toBe("€6.34");
    setLang("de");
    expect(eur(-0.17)).toBe("−0,17 €");
    expect(eur(6.34)).toBe("6,34 €");
  });

  it("formats percentages", () => {
    expect(pct(77.91)).toBe("77.9%");
    setLang("de");
    expect(pct(77.91)).toBe("77,9\u00a0%");
  });

  it("formats dates and zones", () => {
    expect(dateLabel("2026-11-03")).toContain("Nov");
    expect(hourLabel("2026-10-25T00:00:00", true)).toBe("02:00 CEST");
    setLang("de");
    expect(dateLabel("2026-11-03")).toContain("3. Nov");
    expect(shortDateLabel("2026-10-31")).toContain("31. Okt");
    expect(hourLabel("2026-10-25T00:00:00", true)).toBe("02:00 MESZ");
    expect(hourLabel("2026-10-25T01:00:00", true)).toBe("02:00 MEZ");
    expect(dateTimeLabel("2026-01-15T12:00:00")).toContain("MEZ");
  });

  it("translates table labels and regime thresholds", () => {
    setLang("de");
    expect(modelLabel("model")).toContain("P50");
    expect(regimeLabel("extreme_high_top5pct_ge_215.72")).toContain("215,72");
  });
});

describe("t", () => {
  it("fills placeholders and falls back to English", () => {
    expect(t("Updated {date}", { date: "x" })).toBe("Updated x");
    expect(t("Not in the dictionary")).toBe("Not in the dictionary");
    setLang("de");
    expect(getLang()).toBe("de");
    expect(t("Not in the dictionary")).toBe("Not in the dictionary");
  });

  it("places elements inside rich text", () => {
    expect(tRich("See {link} now", { link: 7 })).toEqual(["See ", 7, " now"]);
  });
});
