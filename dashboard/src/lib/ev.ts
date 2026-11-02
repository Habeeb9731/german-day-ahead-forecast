import { hourLabel, parseUtc } from "./time";
import type { ForecastHour } from "./types";

/** EUR/MWh to ct/kWh. 1 EUR/MWh = 0.1 ct/kWh. */
export function eurMwhToCtKwh(price: number): number {
  return price / 10;
}

export interface ChargeSlot {
  valid_from_utc: string;
  kwh: number;
  ctPerKwh: number;
  costEur: number;
}

export type EvResult =
  | { feasible: false; maxKwh: number; reason: "window_too_short" | "invalid_input" }
  | {
      feasible: true;
      slots: ChargeSlot[];
      costEur: number;
      averageCtPerKwh: number;
      costLowEur: number;
      costHighEur: number;
      sixPm: { costEur: number; averageCtPerKwh: number } | null;
      savingsEur: number | null;
    };

export interface EvInput {
  hours: ForecastHour[];
  energyKwh: number;
  powerKw: number;
  /** Index into `hours` where charging may begin. */
  windowStart: number;
  /** Exclusive index into `hours` where the car must be finished. */
  windowEnd: number;
}

function costOf(kwh: number, priceEurMwh: number): number {
  return (kwh * eurMwhToCtKwh(priceEurMwh)) / 100;
}

/** Each hour takes up to `powerKw` kWh. Filling the cheapest hours first minimises cost for a fixed
 * amount of energy, and the car only draws what it needs. A negative price is still a cost line:
 * the wholesale market would pay the buyer, but the energy total stays fixed. */
export function cheapestSchedule(input: EvInput): EvResult {
  const { hours, energyKwh, powerKw, windowStart, windowEnd } = input;
  const window = hours.slice(Math.max(0, windowStart), Math.max(0, windowEnd));
  if (!(energyKwh > 0) || !(powerKw > 0) || window.length === 0) {
    return { feasible: false, maxKwh: 0, reason: "invalid_input" };
  }
  const maxKwh = window.length * powerKw;
  if (energyKwh > maxKwh + 1e-9) {
    return { feasible: false, maxKwh, reason: "window_too_short" };
  }

  const byPrice = [...window].sort((a, b) => a.p50 - b.p50);
  let remaining = energyKwh;
  const chosen: { hour: ForecastHour; kwh: number }[] = [];
  for (const hour of byPrice) {
    if (remaining <= 1e-9) break;
    const kwh = Math.min(powerKw, remaining);
    chosen.push({ hour, kwh });
    remaining -= kwh;
  }
  chosen.sort(
    (a, b) =>
      parseUtc(a.hour.valid_from_utc).getTime() - parseUtc(b.hour.valid_from_utc).getTime(),
  );

  const slots = chosen.map(({ hour, kwh }) => ({
    valid_from_utc: hour.valid_from_utc,
    kwh,
    ctPerKwh: eurMwhToCtKwh(hour.p50),
    costEur: costOf(kwh, hour.p50),
  }));
  const costEur = slots.reduce((s, x) => s + x.costEur, 0);
  const sixPm = sixPmCost(hours, energyKwh, powerKw);
  return {
    feasible: true,
    slots,
    costEur,
    averageCtPerKwh: (costEur * 100) / energyKwh,
    costLowEur: chosen.reduce((s, c) => s + costOf(c.kwh, c.hour.p10), 0),
    costHighEur: chosen.reduce((s, c) => s + costOf(c.kwh, c.hour.p90), 0),
    sixPm,
    savingsEur: sixPm ? sixPm.costEur - costEur : null,
  };
}

/** Cost of plugging in at 18:00 and charging straight through. Null if it would not finish before
 * the forecast day ends, or the day has no 18:00. */
export function sixPmCost(
  hours: ForecastHour[],
  energyKwh: number,
  powerKw: number,
): { costEur: number; averageCtPerKwh: number } | null {
  const start = hours.findIndex((h) => hourLabel(h.valid_from_utc) === "18:00");
  if (start < 0) return null;
  let remaining = energyKwh;
  let costEur = 0;
  for (const hour of hours.slice(start)) {
    if (remaining <= 1e-9) break;
    const kwh = Math.min(powerKw, remaining);
    costEur += costOf(kwh, hour.p50);
    remaining -= kwh;
  }
  if (remaining > 1e-9) return null;
  return { costEur, averageCtPerKwh: (costEur * 100) / energyKwh };
}
