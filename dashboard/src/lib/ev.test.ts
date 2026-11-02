import { describe, expect, it } from "vitest";

import { cheapestSchedule, eurMwhToCtKwh, sixPmCost } from "./ev";
import type { ForecastHour } from "./types";

/** SYNTHETIC SAMPLE PRICES. By default this is 2026-06-15 in Berlin, from 00:00 CEST. */
function day(prices: number[], startHourUtc = 22, startDate = "2026-06-14"): ForecastHour[] {
  const start = Date.parse(`${startDate}T${String(startHourUtc).padStart(2, "0")}:00:00Z`);
  return prices.map((p, i) => ({
    valid_from_utc: new Date(start + i * 3_600_000).toISOString().slice(0, 19),
    p10: p - 10,
    p50: p,
    p90: p + 10,
  }));
}

const FLAT = Array.from({ length: 24 }, () => 100);

describe("unit conversion", () => {
  it("converts EUR/MWh to ct/kWh", () => {
    expect(eurMwhToCtKwh(100)).toBe(10);
    expect(eurMwhToCtKwh(-25)).toBe(-2.5);
  });
});

describe("cheapestSchedule", () => {
  const prices = [...FLAT];
  prices[2] = 10;
  prices[3] = 20;
  prices[4] = 30;

  it("fills cheapest hours first and returns them in time order", () => {
    const r = cheapestSchedule({ hours: day(prices), energyKwh: 15, powerKw: 7, windowStart: 0, windowEnd: 24 });
    if (!r.feasible) throw new Error("expected feasible");
    expect(r.slots.map((s) => s.kwh)).toEqual([7, 7, 1]);
    expect(r.slots.map((s) => s.ctPerKwh)).toEqual([1, 2, 3]);
  });

  it("computes cost in euros from wholesale prices", () => {
    const r = cheapestSchedule({ hours: day(prices), energyKwh: 15, powerKw: 7, windowStart: 0, windowEnd: 24 });
    if (!r.feasible) throw new Error("expected feasible");
    // 7 kWh at 1 ct + 7 kWh at 2 ct + 1 kWh at 3 ct = 24 ct.
    expect(r.costEur).toBeCloseTo(0.24);
    expect(r.averageCtPerKwh).toBeCloseTo(24 / 15);
  });

  it("delivers exactly the requested energy", () => {
    const r = cheapestSchedule({ hours: day(FLAT), energyKwh: 41.3, powerKw: 11, windowStart: 0, windowEnd: 24 });
    if (!r.feasible) throw new Error("expected feasible");
    expect(r.slots.reduce((s, x) => s + x.kwh, 0)).toBeCloseTo(41.3);
  });

  it("respects the plug-in window", () => {
    const r = cheapestSchedule({ hours: day(prices), energyKwh: 7, powerKw: 7, windowStart: 5, windowEnd: 24 });
    if (!r.feasible) throw new Error("expected feasible");
    expect(r.slots[0].ctPerKwh).toBe(10);
  });

  it("reports a window too short to deliver the energy", () => {
    const r = cheapestSchedule({ hours: day(FLAT), energyKwh: 30, powerKw: 7, windowStart: 0, windowEnd: 2 });
    expect(r).toEqual({ feasible: false, maxKwh: 14, reason: "window_too_short" });
  });

  it("accepts energy exactly equal to the window's maximum", () => {
    const r = cheapestSchedule({ hours: day(FLAT), energyKwh: 14, powerKw: 7, windowStart: 0, windowEnd: 2 });
    expect(r.feasible).toBe(true);
  });

  it.each([
    { energyKwh: 0, powerKw: 7, windowStart: 0, windowEnd: 24 },
    { energyKwh: -1, powerKw: 7, windowStart: 0, windowEnd: 24 },
    { energyKwh: 10, powerKw: 0, windowStart: 0, windowEnd: 24 },
    { energyKwh: 10, powerKw: 7, windowStart: 5, windowEnd: 5 },
    { energyKwh: Number.NaN, powerKw: 7, windowStart: 0, windowEnd: 24 },
  ])("rejects invalid input %j", (input) => {
    const r = cheapestSchedule({ hours: day(FLAT), ...input });
    expect(r).toMatchObject({ feasible: false, reason: "invalid_input" });
  });

  it("handles negative prices as a negative cost", () => {
    const negative = [...FLAT];
    negative[1] = -50;
    const r = cheapestSchedule({ hours: day(negative), energyKwh: 7, powerKw: 7, windowStart: 0, windowEnd: 24 });
    if (!r.feasible) throw new Error("expected feasible");
    expect(r.costEur).toBeCloseTo(-0.35);
  });

  it("reports savings against charging at 18:00", () => {
    const evening = [...FLAT];
    evening[18] = 200; // the day starts at 00:00 Berlin, so index 18 is 18:00
    const r = cheapestSchedule({ hours: day(evening), energyKwh: 7, powerKw: 7, windowStart: 0, windowEnd: 24 });
    if (!r.feasible) throw new Error("expected feasible");
    expect(r.sixPm?.costEur).toBeCloseTo(1.4);
    expect(r.savingsEur).toBeCloseTo(1.4 - 0.7);
  });

  it("gives a range from the P10 and P90 prices", () => {
    const r = cheapestSchedule({ hours: day(FLAT), energyKwh: 10, powerKw: 10, windowStart: 0, windowEnd: 24 });
    if (!r.feasible) throw new Error("expected feasible");
    expect(r.costLowEur).toBeCloseTo(0.9);
    expect(r.costHighEur).toBeCloseTo(1.1);
  });
});

describe("sixPmCost", () => {
  it("is null if charging would not finish before the day ends", () => {
    expect(sixPmCost(day(FLAT), 100, 7)).toBeNull();
  });

  it("finds 18:00 Berlin on a 23-hour day", () => {
    // 2026-03-29 starts at 23:00 UTC and has 23 hours. 18:00 CEST is 16:00 UTC, index 17.
    const prices = Array.from({ length: 23 }, () => 100);
    prices[17] = 500;
    const r = sixPmCost(day(prices, 23, "2026-03-28"), 7, 7);
    expect(r?.costEur).toBeCloseTo(3.5);
  });

  it("finds 18:00 Berlin on a 25-hour day", () => {
    // 2026-10-25 starts at 22:00 UTC and has 25 hours. 18:00 CET is 17:00 UTC, index 19.
    const prices = Array.from({ length: 25 }, () => 100);
    prices[19] = 500;
    const r = sixPmCost(day(prices, 22, "2026-10-24"), 7, 7);
    expect(r?.costEur).toBeCloseTo(3.5);
  });
});
