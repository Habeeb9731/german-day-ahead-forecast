import { addDays } from "./time";
import type { ForecastHour, ModelName, TrackHour } from "./types";

export interface KeyStats {
  average: number;
  highest: ForecastHour;
  lowest: ForecastHour;
}

export function keyStats(hours: ForecastHour[]): KeyStats | null {
  if (hours.length === 0) return null;
  const by = (cmp: (a: number, b: number) => boolean) =>
    hours.reduce((best, h) => (cmp(h.p50, best.p50) ? h : best));
  return {
    average: hours.reduce((sum, h) => sum + h.p50, 0) / hours.length,
    highest: by((a, b) => a > b),
    lowest: by((a, b) => a < b),
  };
}

export interface PriceBlock {
  start: ForecastHour;
  hours: number;
  average: number;
}

/** Cheapest and most expensive run of consecutive hours, using the median forecast. */
export function extremeBlocks(
  hours: ForecastHour[],
  length: number,
): { cheapest: PriceBlock; priciest: PriceBlock } | null {
  if (hours.length < length || length < 1) return null;
  let cheapest: PriceBlock | null = null;
  let priciest: PriceBlock | null = null;
  for (let i = 0; i + length <= hours.length; i++) {
    const average = hours.slice(i, i + length).reduce((s, h) => s + h.p50, 0) / length;
    const block = { start: hours[i], hours: length, average };
    if (!cheapest || average < cheapest.average) cheapest = block;
    if (!priciest || average > priciest.average) priciest = block;
  }
  return { cheapest: cheapest!, priciest: priciest! };
}

export interface RollingPoint {
  date: string;
  model: number;
  baseline_prev_day: number | null;
  baseline_prev_week: number | null;
}

const MEAN_ERROR: Record<ModelName, (h: TrackHour) => number | null> = {
  model: (h) => Math.abs(h.actual - h.p50),
  baseline_prev_day: (h) =>
    h.baseline_prev_day === null ? null : Math.abs(h.actual - h.baseline_prev_day),
  baseline_prev_week: (h) =>
    h.baseline_prev_week === null ? null : Math.abs(h.actual - h.baseline_prev_week),
};

function mean(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

/** Rolling MAE per delivery date over the previous `windowDays` calendar days, inclusive. A point
 * appears only once the window holds `windowDays` scored days. */
export function rollingMae(hours: TrackHour[], windowDays = 7): RollingPoint[] {
  const byDay = new Map<string, TrackHour[]>();
  for (const h of hours) {
    const list = byDay.get(h.delivery_date) ?? [];
    list.push(h);
    byDay.set(h.delivery_date, list);
  }
  const days = [...byDay.keys()].sort();
  const points: RollingPoint[] = [];
  for (const day of days) {
    const window: TrackHour[] = [];
    let scored = 0;
    for (let i = 0; i < windowDays; i++) {
      const rows = byDay.get(addDays(day, -i));
      if (rows) {
        window.push(...rows);
        scored += 1;
      }
    }
    if (scored < windowDays) continue;
    points.push({
      date: day,
      model: mean(window.map(MEAN_ERROR.model))!,
      baseline_prev_day: mean(window.map(MEAN_ERROR.baseline_prev_day)),
      baseline_prev_week: mean(window.map(MEAN_ERROR.baseline_prev_week)),
    });
  }
  return points;
}

export interface DailyPoint {
  date: string;
  actual: number;
  p50: number;
  mae: number;
}

export function dailySummary(hours: TrackHour[]): DailyPoint[] {
  const byDay = new Map<string, TrackHour[]>();
  for (const h of hours) {
    const list = byDay.get(h.delivery_date) ?? [];
    list.push(h);
    byDay.set(h.delivery_date, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({
      date,
      actual: rows.reduce((s, r) => s + r.actual, 0) / rows.length,
      p50: rows.reduce((s, r) => s + r.p50, 0) / rows.length,
      mae: rows.reduce((s, r) => s + Math.abs(r.actual - r.p50), 0) / rows.length,
    }));
}
