// SYNTHETIC SAMPLE DATA for local development and CI only. These are not real prices or results.
// Every file carries is_sample: true, the UI shows a banner, and production builds refuse it.
import { mkdirSync, writeFileSync } from "node:fs";

let state = 20261102;
const random = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const noise = (scale) => (random() + random() + random() - 1.5) * scale;

const shape = (h) => 80 + 35 * Math.cos(((h - 19) / 24) * 2 * Math.PI) - (h > 9 && h < 16 ? 45 : 0);
const berlinDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
const berlinHour = (d) =>
  Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(d),
  );
const iso = (d) => d.toISOString().slice(0, 19);
const round = (x) => Math.round(x * 100) / 100;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const now = new Date();
const today = berlinDate(now);
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
function hoursOf(date) {
  const out = [];
  const start = new Date(`${addDays(date, -1)}T20:00:00Z`);
  for (let i = 0; i < 30; i++) {
    const t = new Date(start.getTime() + i * 3_600_000);
    if (berlinDate(t) === date) out.push(t);
  }
  return out;
}
function forecastHour(t, level) {
  const p50 = round(shape(berlinHour(t)) + level + noise(8));
  return { valid_from_utc: iso(t), p10: round(p50 - 18 - random() * 10), p50, p90: round(p50 + 18 + random() * 12) };
}

const deliveryDate = addDays(today, 1);
const tomorrow = {
  kind: "live_forecast",
  is_sample: true,
  status: "ok",
  delivery_date: deliveryDate,
  generated_at_utc: iso(new Date(now.getTime() - 3_600_000)),
  cutoff_utc: iso(new Date(now.getTime() - 1_800_000)),
  model_version: "SAMPLE-not-a-real-model",
  hours: hoursOf(deliveryDate).map((t) => forecastHour(t, 0)),
};

const track = [];
for (let n = 90; n >= 1; n--) {
  const date = addDays(today, -n);
  const level = noise(40);
  for (const t of hoursOf(date)) {
    const f = forecastHour(t, level);
    const actual = round(f.p50 + noise(30));
    track.push({
      ...f,
      delivery_date: date,
      actual,
      baseline_prev_day: round(actual + noise(55)),
      baseline_prev_week: round(actual + noise(65)),
      model_version: tomorrow.model_version,
      forecast_generated_at_utc: `${addDays(date, -1)}T09:00:00`,
    });
  }
}

function score(rows) {
  const stat = (point, low, high) => {
    const errors = rows.map((r) => r.actual - point(r));
    return {
      n: rows.length,
      mae: mean(errors.map(Math.abs)),
      rmse: Math.sqrt(mean(errors.map((e) => e * e))),
      smape:
        100 * mean(rows.map((r) => (2 * Math.abs(r.actual - point(r))) / Math.max(1e-9, Math.abs(r.actual) + Math.abs(point(r))))),
      coverage_p10_p90: 100 * mean(rows.map((r) => (r.actual >= low(r) && r.actual <= high(r) ? 1 : 0))),
      interval_width: mean(rows.map((r) => high(r) - low(r))),
    };
  };
  return {
    model: stat((r) => r.p50, (r) => r.p10, (r) => r.p90),
    baseline_prev_day: stat((r) => r.baseline_prev_day, (r) => r.baseline_prev_day - 30, (r) => r.baseline_prev_day + 30),
    baseline_prev_week: stat((r) => r.baseline_prev_week, (r) => r.baseline_prev_week - 35, (r) => r.baseline_prev_week + 35),
  };
}
const groupBy = (rows, key) => {
  const out = {};
  for (const r of rows) (out[key(r)] ??= []).push(r);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, score(v)]));
};
const sorted = [...track].map((r) => r.actual).sort((a, b) => a - b);
const high = sorted[Math.floor(sorted.length * 0.95)];
const low = sorted[Math.floor(sorted.length * 0.05)];
const overall = score(track);
const sig = (b) => {
  const diff = overall.model.mae - overall[b].mae;
  return { mae_difference_model_minus_baseline: diff, ci95_low: diff - 1, ci95_high: diff + 1, verdict: "model better" };
};
const backtest = {
  kind: "backtest",
  is_sample: true,
  note: "SYNTHETIC SAMPLE DATA. Not a real backtest.",
  generated_at_utc: iso(now),
  model_version: tomorrow.model_version,
  target: "SAMPLE",
  test_start: addDays(today, -90),
  test_end: addDays(today, -1),
  train_start: addDays(today, -600),
  retrain: "monthly, expanding window",
  n_features: 8,
  days_scored: 90,
  overall,
  significance: { baseline_prev_day: sig("baseline_prev_day"), baseline_prev_week: sig("baseline_prev_week") },
  by_regime: {
    all: overall,
    negative_price: score(sorted.length ? track.filter((r) => r.actual < 20) : []),
    [`extreme_high_top5pct_ge_${high.toFixed(2)}`]: score(track.filter((r) => r.actual >= high)),
    [`extreme_low_bottom5pct_le_${low.toFixed(2)}`]: score(track.filter((r) => r.actual <= low)),
  },
  by_hour: groupBy(track, (r) => berlinHour(new Date(`${r.valid_from_utc}Z`))),
  by_month: groupBy(track, (r) => r.delivery_date.slice(0, 7)),
  feature_importance: {
    price_lag_1d: 0.2,
    load_fc: 0.16,
    wx_wind_cubed_mean: 0.14,
    hour: 0.12,
    wx_shortwave_radiation_mean: 0.1,
    price_same_hour_mean_7d: 0.08,
    dow: 0.06,
    wx_temperature_2m_mean: 0.04,
  },
};

mkdirSync("sample-data", { recursive: true });
const write = (name, data) => writeFileSync(`sample-data/${name}`, `${JSON.stringify(data)}\n`);
write("tomorrow.json", tomorrow);
write("track_record.json", { kind: "live_track_record", is_sample: true, generated_at_utc: iso(now), hours: track });
write("backtest.json", backtest);
write("backtest_track.json", { kind: "backtest_track_record", is_sample: true, generated_at_utc: iso(now), hours: track });
console.log("Wrote SYNTHETIC sample data to sample-data/");
