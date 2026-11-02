import { describe, expect, it } from "vitest";

import {
  highlightBlock,
  latestScoredDay,
  leastCertainHour,
  liveCoverage,
  negativeHours,
  recentDays,
} from "./dashboard";
import type { ForecastHour, TrackHour } from "./types";

/** SYNTHETIC SAMPLE DATA */
function track(date: string, actual: number, p50: number, p10 = p50 - 5, p90 = p50 + 5): TrackHour {
  return {
    valid_from_utc: `${date}T12:00:00`,
    delivery_date: date,
    p10,
    p50,
    p90,
    actual,
    baseline_prev_day: null,
    baseline_prev_week: null,
    model_version: "sample",
    forecast_generated_at_utc: `${date}T09:00:00`,
  };
}
const hour = (i: number, p50: number, width = 10): ForecastHour => ({
  valid_from_utc: `2026-06-15T${String(i).padStart(2, "0")}:00:00`,
  p10: p50 - width,
  p50,
  p90: p50 + width,
});

describe("latestScoredDay", () => {
  it("reports the newest day and the change in actual price", () => {
    const r = latestScoredDay([track("2026-06-01", 50, 40), track("2026-06-02", 80, 70)]);
    expect(r?.date).toBe("2026-06-02");
    expect(r?.changeFromPrevious).toBe(30);
    expect(r?.mae).toBe(10);
  });
  it("has no change for a single day, and nothing with no data", () => {
    expect(latestScoredDay([track("2026-06-01", 50, 40)])?.changeFromPrevious).toBeNull();
    expect(latestScoredDay([])).toBeNull();
  });
});

describe("recentDays", () => {
  it("keeps the newest days, oldest first", () => {
    const rows = ["01", "02", "03"].map((d) => track(`2026-06-${d}`, 50, 40));
    expect(recentDays(rows, 2).map((d) => d.date)).toEqual(["2026-06-02", "2026-06-03"]);
  });
});

describe("liveCoverage", () => {
  it("counts actuals inside the range, bounds included", () => {
    const rows = [track("2026-06-01", 55, 50), track("2026-06-02", 56, 50)];
    expect(liveCoverage(rows)).toBe(50);
  });
  it("uses only the last N days", () => {
    const rows = [track("2026-06-01", 500, 50), track("2026-06-02", 50, 50)];
    expect(liveCoverage(rows, 1)).toBe(100);
  });
  it("is null with no data rather than zero", () => {
    expect(liveCoverage([])).toBeNull();
  });
});

describe("negativeHours", () => {
  it("separates likely from possible", () => {
    expect(negativeHours([hour(0, -5), hour(1, 5), hour(2, 50)])).toEqual({ likely: 1, possible: 2 });
  });
});

describe("leastCertainHour", () => {
  it("finds the widest range", () => {
    expect(leastCertainHour([hour(0, 5, 10), hour(1, 5, 30)])?.valid_from_utc).toContain("T01");
    expect(leastCertainHour([])).toBeNull();
  });
});

describe("highlightBlock", () => {
  const hours = [hour(0, 10), hour(1, 20), hour(2, 30), hour(3, 40)];
  it("moves exactly the block into its own series", () => {
    const rows = highlightBlock(hours, hours[1].valid_from_utc, 2);
    expect(rows.map((r) => r.cheapest)).toEqual([null, 20, 30, null]);
    expect(rows.map((r) => r.price)).toEqual([10, null, null, 40]);
  });
  it("leaves every bar plain without a block", () => {
    const rows = highlightBlock(hours, undefined, 2);
    expect(rows.every((r) => r.cheapest === null && r.price !== null)).toBe(true);
  });
});
