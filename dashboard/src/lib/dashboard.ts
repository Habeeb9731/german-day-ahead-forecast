import { dailySummary, type DailyPoint } from "./stats";
import type { ForecastHour, TrackHour } from "./types";

/** The most recent scored day, with the change in actual average price from the day before. */
export function latestScoredDay(
  hours: TrackHour[],
): (DailyPoint & { changeFromPrevious: number | null }) | null {
  const days = dailySummary(hours);
  const last = days[days.length - 1];
  if (!last) return null;
  const previous = days[days.length - 2];
  return { ...last, changeFromPrevious: previous ? last.actual - previous.actual : null };
}

/** The last `count` scored days, oldest first. */
export function recentDays(hours: TrackHour[], count: number): DailyPoint[] {
  return dailySummary(hours).slice(-count);
}

/** Share of actual prices inside P10-P90 over the last `days` scored days, in percent. */
export function liveCoverage(hours: TrackHour[], days = 30): number | null {
  const keep = new Set(dailySummary(hours).slice(-days).map((d) => d.date));
  const rows = hours.filter((h) => keep.has(h.delivery_date));
  if (rows.length === 0) return null;
  return (100 * rows.filter((h) => h.actual >= h.p10 && h.actual <= h.p90).length) / rows.length;
}

/** Hours whose median forecast, and hours whose P10, fall below zero. */
export function negativeHours(hours: ForecastHour[]): { likely: number; possible: number } {
  return {
    likely: hours.filter((h) => h.p50 < 0).length,
    possible: hours.filter((h) => h.p10 < 0).length,
  };
}

export function leastCertainHour(hours: ForecastHour[]): ForecastHour | null {
  if (hours.length === 0) return null;
  return hours.reduce((a, b) => (b.p90 - b.p10 > a.p90 - a.p10 ? b : a));
}

/** Bar data with the cheapest consecutive block split out, so it can take its own colour. */
export function highlightBlock(
  hours: ForecastHour[],
  startUtc: string | undefined,
  length: number,
): { valid_from_utc: string; price: number | null; cheapest: number | null; p10: number; p90: number }[] {
  const start = hours.findIndex((h) => h.valid_from_utc === startUtc);
  return hours.map((h, i) => {
    const inBlock = start >= 0 && i >= start && i < start + length;
    return {
      valid_from_utc: h.valid_from_utc,
      price: inBlock ? null : h.p50,
      cheapest: inBlock ? h.p50 : null,
      p10: h.p10,
      p90: h.p90,
    };
  });
}
