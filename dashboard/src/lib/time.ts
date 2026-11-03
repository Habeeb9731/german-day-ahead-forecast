import { getLang, intlLocale } from "./i18n";

/** Timestamps arrive as naive UTC ISO strings. Everything shown to people is Europe/Berlin. */

const TZ = "Europe/Berlin";

export function parseUtc(iso: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
}

export function berlinDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

export function berlinHour(iso: string): number {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(parseUtc(iso));
  return Number(text);
}

function berlinOffsetName(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, timeZoneName: "short" });
  const name = parts.formatToParts(d).find((p) => p.type === "timeZoneName")?.value;
  const summer = name === "GMT+2" || name === "CEST";
  if (getLang() === "de") return summer ? "MESZ" : "MEZ";
  return summer ? "CEST" : "CET";
}

/** "14:00". On a daylight saving day the zone is added, so the repeated hour stays unambiguous. */
export function hourLabel(iso: string, isDstDay = false): string {
  const d = parseUtc(iso);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return isDstDay ? `${time} ${berlinOffsetName(d)}` : time;
}

export function hourRangeLabel(startIso: string, hours: number): string {
  const end = new Date(parseUtc(startIso).getTime() + hours * 3_600_000);
  return `${hourLabel(startIso)}–${hourLabel(end.toISOString())}`;
}

export function dateLabel(isoDate: string): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

export function shortDateLabel(isoDate: string): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

export function dateTimeLabel(iso: string): string {
  const d = parseUtc(iso);
  const text = new Intl.DateTimeFormat(intlLocale(), {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${text} ${berlinOffsetName(d)}`;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The newest delivery date that should have a forecast by `now`. The cutoff is 11:30 Berlin. */
export function expectedDeliveryDate(now: Date): string {
  const today = berlinDate(now);
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return clock >= "11:30" ? addDays(today, 1) : today;
}

export function isForecastStale(deliveryDate: string, now: Date): boolean {
  return deliveryDate < expectedDeliveryDate(now);
}
