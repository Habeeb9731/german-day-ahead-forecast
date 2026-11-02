"""Conformal calibration of the P10-P90 range (conformalized quantile regression).

Quantile models tend to give ranges that are too narrow out of sample. Before each training cycle,
a model trained without the latest 90 days predicts those days. The miss in each Berlin hour sets
how far to widen, or narrow, that hour's range. P50 is left unchanged, so point accuracy is too.
This was added after the first backtest showed 58.5% coverage, so reports show raw coverage as well.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

HOLDOUT_DAYS = 90
TARGET_COVERAGE = 0.8
GLOBAL_KEY = "all"


def holdout_split(data: pd.DataFrame, before: date) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Rows to train on and rows to calibrate on, all strictly before `before`."""
    start = before - timedelta(days=HOLDOUT_DAYS)
    fit = data[data["delivery_date"] < start]
    holdout = data[(data["delivery_date"] >= start) & (data["delivery_date"] < before)]
    return fit, holdout


def _adjustment(scores: np.ndarray) -> float:
    n = len(scores)
    level = min(1.0, TARGET_COVERAGE * (n + 1) / n)
    return float(np.quantile(scores, level, method="higher"))


def fit(holdout: pd.DataFrame, predicted: pd.DataFrame) -> dict[str, float]:
    """Adjustment per Berlin hour from holdout predictions, plus an overall fallback."""
    if holdout.empty:
        raise ValueError("calibration needs holdout rows")
    scores = np.maximum(
        predicted["p10"].to_numpy() - holdout["y"].to_numpy(),
        holdout["y"].to_numpy() - predicted["p90"].to_numpy(),
    )
    hours = holdout["hour"].to_numpy()
    result = {str(int(h)): _adjustment(scores[hours == h]) for h in np.unique(hours)}
    result[GLOBAL_KEY] = _adjustment(scores)
    return result


def apply(predicted: pd.DataFrame, hours: pd.Series, adjustments: dict[str, float]) -> pd.DataFrame:
    """Adjust the range, keeping P10 <= P50 <= P90 even when an adjustment narrows it."""
    q = np.array([adjustments.get(str(int(h)), adjustments[GLOBAL_KEY]) for h in hours])
    out = predicted.copy()
    out["p10"] = np.minimum(predicted["p10"].to_numpy() - q, predicted["p50"].to_numpy())
    out["p90"] = np.maximum(predicted["p90"].to_numpy() + q, predicted["p50"].to_numpy())
    return out
