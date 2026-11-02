"""Walk-forward backtest, retraining monthly on everything before each test month.

Baselines come from the same as-of features as the model, so all three see the same information.
Baselines give point forecasts only. To compare P10-P90 coverage, they get an interval from their
own trailing 90-day errors at the same hour, using only days whose prices were known at the cutoff.
"""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from epf.features.build import feature_columns
from epf.models import lgbm
from epf.models.metrics import block_bootstrap_mae_diff, coverage, mae, pinball, rmse, smape
from epf.timeutil import utcnow

log = logging.getLogger(__name__)

BASELINES = {"baseline_prev_day": "price_lag_1d", "baseline_prev_week": "price_lag_7d"}
MODEL_NAMES = ("model", *BASELINES)
BASELINE_INTERVAL_DAYS = 90
MIN_INTERVAL_DAYS = 14


def month_starts(start: date, end: date) -> list[date]:
    out = []
    current = start.replace(day=1)
    while current <= end:
        out.append(current)
        current = (current + timedelta(days=32)).replace(day=1)
    return out


def walk_forward(data: pd.DataFrame, start: date, end: date) -> tuple[pd.DataFrame, pd.Series, str]:
    """`data` holds features plus `y`. Returns predictions, mean importance and model version."""
    features = feature_columns(data.drop(columns=["y"]))
    frames = []
    importances = []
    for month in month_starts(start, end):
        next_month = (month + timedelta(days=32)).replace(day=1)
        train = data[data["delivery_date"] < month]
        test = data[
            (data["delivery_date"] >= max(month, start))
            & (data["delivery_date"] < next_month)
            & (data["delivery_date"] <= end)
        ]
        if test.empty:
            continue
        if train.empty:
            raise ValueError(f"no training data before {month}")
        assert train["delivery_date"].max() < test["delivery_date"].min()
        log.info(
            "train through %s (%d rows), test %s", train["delivery_date"].max(), len(train), month
        )
        model = lgbm.train(train, train["y"], features)
        predicted = model.predict(test)
        predicted["trained_through"] = train["delivery_date"].max()
        frames.append(
            pd.concat([test[["delivery_date", "valid_from_utc", "hour", "y"]], predicted], axis=1)
        )
        importances.append(model.importance())
    out = pd.concat(frames, ignore_index=True)
    for name, col in BASELINES.items():
        out[name] = data.set_index("valid_from_utc")[col].reindex(out["valid_from_utc"]).to_numpy()
    return out, pd.concat(importances, axis=1).mean(axis=1), lgbm.model_version(features)


def baseline_intervals(data: pd.DataFrame, predictions: pd.DataFrame) -> pd.DataFrame:
    """Add p10/p90 per baseline from trailing errors at the same hour. For delivery day D, errors
    through D-1 are known at the cutoff, because D-1 prices were published on D-2."""
    out = predictions.copy()
    history = data[["delivery_date", "hour", "y", *BASELINES.values()]]
    for name, col in BASELINES.items():
        h = history.dropna(subset=[col, "y"])
        h = h.assign(err=h["y"] - h[col])
        by_hour = {k: g for k, g in h.groupby("hour")}
        low = np.full(len(out), np.nan)
        high = np.full(len(out), np.nan)
        for i, (day, hour, point) in enumerate(
            zip(out["delivery_date"], out["hour"], out[name], strict=True)
        ):
            group = by_hour.get(hour)
            if group is None or np.isnan(point):
                continue
            mask = (group["delivery_date"] < day) & (
                group["delivery_date"] >= day - timedelta(days=BASELINE_INTERVAL_DAYS)
            )
            errors = group.loc[mask, "err"].to_numpy()
            if len(errors) >= MIN_INTERVAL_DAYS:
                low[i] = point + np.quantile(errors, 0.1)
                high[i] = point + np.quantile(errors, 0.9)
        out[f"{name}_p10"] = low
        out[f"{name}_p90"] = high
    return out


def score(df: pd.DataFrame) -> dict[str, dict[str, float | int]]:
    """Metrics for model and baselines on a slice. All are scored on the same complete rows."""
    columns = ["y", "p10", "p50", "p90"]
    for name in BASELINES:
        columns += [name, f"{name}_p10", f"{name}_p90"]
    d = df.dropna(subset=columns)
    if d.empty:
        return {}
    y = d["y"].to_numpy(float)
    results: dict[str, dict[str, float | int]] = {}
    for name in MODEL_NAMES:
        if name == "model":
            point, low, high = d["p50"], d["p10"], d["p90"]
        else:
            point, low, high = d[name], d[f"{name}_p10"], d[f"{name}_p90"]
        p, lo, hi = point.to_numpy(float), low.to_numpy(float), high.to_numpy(float)
        results[name] = {
            "n": len(d),
            "mae": mae(y, p),
            "rmse": rmse(y, p),
            "smape": smape(y, p),
            "coverage_p10_p90": coverage(y, lo, hi),
            "interval_width": float(np.mean(hi - lo)),
            "pinball_p10": pinball(y, lo, 0.1),
            "pinball_p50": pinball(y, p, 0.5),
            "pinball_p90": pinball(y, hi, 0.9),
        }
    return results


def regimes(df: pd.DataFrame) -> dict[str, pd.Series]:
    """Slices defined from actual prices, for evaluation only."""
    y = df["y"]
    high = float(y.quantile(0.95))
    low = float(y.quantile(0.05))
    return {
        "all": pd.Series(True, index=df.index),
        "negative_price": y < 0,
        f"extreme_high_top5pct_ge_{high:.2f}": y >= high,
        f"extreme_low_bottom5pct_le_{low:.2f}": y <= low,
        "normal_middle90pct": (y > low) & (y < high),
        "dst_change_days": df["day_hours"] != 24,
    }


def build_report(
    predictions: pd.DataFrame,
    importance: pd.Series,
    version: str,
    start: date,
    end: date,
    train_start: date,
    n_features: int,
) -> dict[str, Any]:
    p = predictions
    complete = p.dropna(subset=["y", "p50", *BASELINES])
    days = pd.factorize(complete["delivery_date"])[0].astype(np.int64)
    significance = {}
    for name in BASELINES:
        diff, low, high = block_bootstrap_mae_diff(
            complete["y"].to_numpy(float),
            complete["p50"].to_numpy(float),
            complete[name].to_numpy(float),
            days,
        )
        significance[name] = {
            "mae_difference_model_minus_baseline": diff,
            "ci95_low": low,
            "ci95_high": high,
            "verdict": "model better"
            if high < 0
            else "baseline better"
            if low > 0
            else "inconclusive",
        }
    months = p["delivery_date"].map(lambda d: f"{d:%Y-%m}")
    return {
        "kind": "backtest",
        "note": "Walk-forward backtest results, not live forecasts.",
        "generated_at_utc": utcnow().isoformat(timespec="seconds"),
        "model_version": version,
        "target": "hourly day-ahead price, DE-LU, EUR/MWh",
        "test_start": start.isoformat(),
        "test_end": end.isoformat(),
        "train_start": train_start.isoformat(),
        "retrain": "monthly, expanding window",
        "n_features": n_features,
        "params": {k: v for k, v in lgbm.PARAMS.items() if k not in {"n_jobs", "verbose"}},
        "overall": score(p),
        "significance": significance,
        "by_regime": {k: score(p[m]) for k, m in regimes(p).items()},
        "by_hour": {str(h): score(g) for h, g in p.groupby("hour")},
        "by_month": {str(m): score(g) for m, g in p.groupby(months)},
        "feature_importance": {k: float(v) for k, v in importance.head(25).items()},
        "days_scored": int(p["delivery_date"].nunique()),
    }


def write_report(report: dict[str, Any], predictions: pd.DataFrame, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "report.json"
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    predictions.to_parquet(out_dir / "predictions.parquet", index=False)
    return path
