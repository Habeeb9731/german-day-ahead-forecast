/** Data contract between the pipeline's export step and the dashboard. Prices are EUR/MWh. */

export interface ForecastHour {
  valid_from_utc: string;
  p10: number;
  p50: number;
  p90: number;
}

export interface TomorrowFile {
  kind: "live_forecast";
  is_sample: boolean;
  status: "ok" | "missed";
  delivery_date: string;
  generated_at_utc: string;
  cutoff_utc: string;
  model_version: string;
  hours: ForecastHour[];
}

export interface TrackHour extends ForecastHour {
  delivery_date: string;
  actual: number;
  baseline_prev_day: number | null;
  baseline_prev_week: number | null;
  model_version: string;
  forecast_generated_at_utc: string;
}

export interface TrackRecordFile {
  kind: "live_track_record";
  is_sample: boolean;
  generated_at_utc: string;
  hours: TrackHour[];
}

export type ModelName = "model" | "baseline_prev_day" | "baseline_prev_week";

export interface Score {
  n: number;
  mae: number;
  rmse: number;
  smape: number;
  coverage_p10_p90: number;
  interval_width: number;
}

export type ScoreSet = Partial<Record<ModelName, Score>>;

export interface Significance {
  mae_difference_model_minus_baseline: number;
  ci95_low: number;
  ci95_high: number;
  verdict: "model better" | "baseline better" | "inconclusive";
}

export interface BacktestFile {
  kind: "backtest";
  is_sample?: boolean;
  generated_at_utc: string;
  model_version: string;
  target: string;
  test_start: string;
  test_end: string;
  train_start: string;
  retrain: string;
  n_features: number;
  days_scored: number;
  overall: ScoreSet;
  significance: Record<"baseline_prev_day" | "baseline_prev_week", Significance>;
  by_regime: Record<string, ScoreSet>;
  by_hour: Record<string, ScoreSet>;
  by_month: Record<string, ScoreSet>;
  feature_importance: Record<string, number>;
}
