import { describe, expect, it } from "vitest";

import { dailySummary, extremeBlocks, keyStats, rollingMae } from "./stats";
import { expectedDeliveryDate, hourLabel, isForecastStale } from "./time";
import type { ForecastHour, TrackHour } from "./types";

/** SYNTHETIC SAMPLE DATA */
const hours = [50, 10, 20, -5, 90].map(
  (p50, i): ForecastHour => ({
    valid_from_utc: `2026-06-15T0${i}:00:00`,
    p10: p50 - 5,
    p50,
    p90: p50 + 5,
  }),
);

function track(date: string, actual: number, p50: number): TrackHour {
  return {
    valid_from_utc: `${date}T12:00:00`,
    delivery_date: date,
    p10: p50 - 5,
    p50,
    p90: p50 + 5,
    actual,
    baseline_prev_day: actual + 20,
    baseline_prev_week: null,
    model_version: "sample",
    forecast_generated_at_utc: `${date}T09:00:00`,
  };
}

describe("keyStats", () => {
  it("finds average, highest and lowest, keeping negative prices", () => {
    const s = keyStats(hours)!;
    expect(s.average).toBe(33);
    expect(s.highest.p50).toBe(90);
    expect(s.lowest.p50).toBe(-5);
  });
  it("is null with no hours", () => {
    expect(keyStats([])).toBeNull();
  });
});

describe("extremeBlocks", () => {
  it("finds consecutive runs", () => {
    const b = extremeBlocks(hours, 2)!;
    expect(b.cheapest.start.p50).toBe(20);
    expect(b.cheapest.average).toBe(7.5);
    expect(b.priciest.start.p50).toBe(-5);
    expect(b.priciest.average).toBe(42.5);
  });
  it("is null when the day is too short", () => {
    expect(extremeBlocks(hours, 6)).toBeNull();
  });
});

describe("rollingMae", () => {
  const dates = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"];
  const rows = dates.map((d, i) => track(d, 100, 100 + i * 10));

  it("waits for a full window", () => {
    const points = rollingMae(rows, 3);
    expect(points.map((p) => p.date)).toEqual(["2026-06-03", "2026-06-04"]);
  });
  it("averages errors over the window", () => {
    const points = rollingMae(rows, 3);
    expect(points[0].model).toBeCloseTo(10);
    expect(points[1].model).toBeCloseTo(20);
    expect(points[0].baseline_prev_day).toBeCloseTo(20);
  });
  it("uses null when a baseline has no data", () => {
    expect(rollingMae(rows, 3)[0].baseline_prev_week).toBeNull();
  });
  it("does not bridge missing days", () => {
    const gappy = rows.filter((r) => r.delivery_date !== "2026-06-02");
    expect(rollingMae(gappy, 3)).toEqual([]);
  });
});

describe("dailySummary", () => {
  it("sorts by date and computes MAE", () => {
    const s = dailySummary([track("2026-06-02", 100, 90), track("2026-06-01", 50, 80)]);
    expect(s.map((d) => d.date)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(s[0].mae).toBe(30);
  });
});

describe("Berlin time", () => {
  it("labels repeated hour on 25-hour day with the zone", () => {
    expect(hourLabel("2026-10-25T00:00:00", true)).toBe("02:00 CEST");
    expect(hourLabel("2026-10-25T01:00:00", true)).toBe("02:00 CET");
  });
  it("expects tomorrow only after the cutoff", () => {
    expect(expectedDeliveryDate(new Date("2026-06-15T09:29:00Z"))).toBe("2026-06-15");
    expect(expectedDeliveryDate(new Date("2026-06-15T09:31:00Z"))).toBe("2026-06-16");
    expect(expectedDeliveryDate(new Date("2026-01-15T10:29:00Z"))).toBe("2026-01-15");
    expect(expectedDeliveryDate(new Date("2026-01-15T10:31:00Z"))).toBe("2026-01-16");
  });
  it("marks an old forecast as stale", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(isForecastStale("2026-06-15", now)).toBe(true);
    expect(isForecastStale("2026-06-16", now)).toBe(false);
  });
});
