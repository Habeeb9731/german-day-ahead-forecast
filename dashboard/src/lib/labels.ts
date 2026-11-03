import { getLang, intlLocale, t } from "./i18n";
import type { ModelName } from "./types";

const MODEL_LABELS: Record<ModelName, string> = {
  model: "Model (P50)",
  baseline_prev_day: "Same hour, previous day",
  baseline_prev_week: "Same hour, last week",
};

export function modelLabel(name: ModelName): string {
  return t(MODEL_LABELS[name]);
}

const LOCATIONS: Record<string, string> = {
  north_sea_coast: "North Sea coast",
  hamburg: "Hamburg",
  berlin: "Berlin",
  central: "central Germany",
  karlsruhe: "Karlsruhe",
  munich: "Munich",
  mean: "national average",
};

const WEATHER: Record<string, string> = {
  wind_speed_100m: "Wind speed at 100 m",
  shortwave_radiation: "Solar radiation",
  temperature_2m: "Temperature",
  cloud_cover: "Cloud cover",
};

const EXACT: Record<string, string> = {
  hour: "Hour of day",
  dow: "Day of week",
  month: "Month",
  day_of_year: "Day of year",
  is_weekend: "Weekend",
  day_hours: "Hours in day (daylight saving)",
  holiday_share: "Holiday, delivery day",
  holiday_share_prev: "Holiday, previous day",
  holiday_share_next: "Holiday, next day",
  price_lag_1d: "Price, same hour yesterday",
  price_lag_2d: "Price, same hour 2 days ago",
  price_lag_7d: "Price, same hour last week",
  price_lag_14d: "Price, same hour 2 weeks ago",
  price_prev_mean: "Yesterday's average price",
  price_prev_min: "Yesterday's lowest price",
  price_prev_max: "Yesterday's highest price",
  price_prev_std: "Yesterday's price spread",
  price_prev_negative_hours: "Yesterday's negative-price hours",
  price_mean_7d: "7-day average price",
  price_mean_28d: "28-day average price",
  price_same_hour_mean_7d: "7-day average price at this hour",
  load_fc: "Demand forecast",
  load_fc_prev: "Yesterday's demand forecast",
  load_fc_delta: "Demand forecast change from yesterday",
  load_fc_day_mean: "Demand forecast, daily average",
  load_fc_day_max: "Demand forecast, daily peak",
  res_forecast_prev_total: "Yesterday's renewable forecast",
  res_forecast_prev_day_mean: "Yesterday's renewable forecast, daily average",
  wx_wind_cubed_mean: "Wind power proxy (wind speed cubed)",
  wx_wind_spread: "Wind speed spread across locations",
  wx_lead_hours: "Weather forecast lead time",
  wind_on_forecast_prev: "Yesterday's onshore wind forecast",
  wind_off_forecast_prev: "Yesterday's offshore wind forecast",
  pv_forecast_prev: "Yesterday's solar forecast",
  load_actual_d2: "Actual demand, 2 days ago",
  load_actual_d2_mean: "Actual demand, 2 days ago, daily average",
  residual_actual_d2: "Residual load, 2 days ago",
  residual_actual_d2_mean: "Residual load, 2 days ago, daily average",
  wind_on_actual_d2: "Onshore wind output, 2 days ago",
  wind_on_actual_d2_mean: "Onshore wind output, 2 days ago, daily average",
  wind_off_actual_d2: "Offshore wind output, 2 days ago",
  wind_off_actual_d2_mean: "Offshore wind output, 2 days ago, daily average",
  pv_actual_d2: "Solar output, 2 days ago",
  pv_actual_d2_mean: "Solar output, 2 days ago, daily average",
};

/** Plain-language feature name. Unknown names fall back to the raw ID rather than a guess. */
export function featureLabel(name: string): string {
  if (EXACT[name]) return t(EXACT[name]);
  if (name.startsWith("wx_")) {
    for (const [variable, label] of Object.entries(WEATHER)) {
      if (name.startsWith(`wx_${variable}_`)) {
        const location = name.slice(`wx_${variable}_`.length);
        return `${t(label)}, ${LOCATIONS[location] ? t(LOCATIONS[location]) : location}`;
      }
    }
  }
  return name;
}

/** Plain-language regime name. Thresholds embedded in the key come from the backtest report. */
export function regimeLabel(key: string): string {
  if (key === "all") return t("All hours");
  if (key === "negative_price") return t("Negative prices");
  if (key === "normal_middle90pct") return t("Middle 90% of prices");
  if (key === "dst_change_days") return t("Daylight saving days");
  const high = key.match(/^extreme_high_top5pct_ge_(-?[\d.]+)$/);
  if (high) return t("Highest 5% of prices (≥ {value} EUR/MWh)", { value: fmt(Number(high[1])) });
  const low = key.match(/^extreme_low_bottom5pct_le_(-?[\d.]+)$/);
  if (low) return t("Lowest 5% of prices (≤ {value} EUR/MWh)", { value: fmt(Number(low[1])) });
  return key;
}

/** Euro amount with the sign before the symbol, such as −€0.17. */
export function eur(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return t("n/a");
  const sign = value < 0 ? "−" : "";
  return getLang() === "de" ? `${sign}${fmt(Math.abs(value))} €` : `${sign}€${fmt(Math.abs(value))}`;
}

export function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return t("n/a");
  return value.toLocaleString(intlLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** A percentage in the local style: 77.9% in English, 77,9 % in German. */
export function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return t("n/a");
  return `${fmt(value, digits)}${getLang() === "de" ? "\u00a0%" : "%"}`;
}

/** Every label held in a table above, so the translation test can check them too. */
export const LABEL_STRINGS = [
  ...Object.values(MODEL_LABELS),
  ...Object.values(LOCATIONS),
  ...Object.values(WEATHER),
  ...Object.values(EXACT),
];
