"""LightGBM quantile models. Parameters are fixed up front, never tuned on the backtest window."""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd

QUANTILES = (0.1, 0.5, 0.9)
PARAMS: dict[str, Any] = {
    "objective": "quantile",
    "learning_rate": 0.05,
    "n_estimators": 400,
    "num_leaves": 31,
    "min_child_samples": 40,
    "subsample": 0.8,
    "subsample_freq": 1,
    "colsample_bytree": 0.8,
    "reg_lambda": 1.0,
    "random_state": 42,
    "deterministic": True,
    "force_row_wise": True,
    "n_jobs": min(4, os.cpu_count() or 1),  # more threads than this ran slower when tested
    "verbose": -1,
}
# Runtime settings that do not change the model's design, so they stay out of its version.
RUNTIME_PARAMS = {"n_jobs", "verbose"}


def model_version(features: list[str]) -> str:
    """Identifies the model design: changes to parameters or feature set change the version."""
    params = {k: v for k, v in PARAMS.items() if k not in RUNTIME_PARAMS}
    payload = json.dumps({"params": params, "q": QUANTILES, "features": sorted(features)})
    return "lgbm-q-" + hashlib.sha256(payload.encode()).hexdigest()[:10]


@dataclass
class QuantileModel:
    features: list[str]
    models: dict[float, lgb.LGBMRegressor]

    def predict(self, x: pd.DataFrame) -> pd.DataFrame:
        """P10, P50 and P90. Quantiles are fitted separately and can cross, so they are sorted."""
        raw = np.column_stack([self.models[q].predict(x[self.features]) for q in QUANTILES])
        raw.sort(axis=1)
        return pd.DataFrame(raw, columns=["p10", "p50", "p90"], index=x.index)

    def importance(self) -> pd.Series:
        """Mean share of total split gain across the quantile models."""
        shares = []
        for model in self.models.values():
            gain = model.booster_.feature_importance(importance_type="gain").astype(float)
            shares.append(gain / gain.sum() if gain.sum() else gain)
        return pd.Series(np.mean(shares, axis=0), index=self.features).sort_values(ascending=False)


def train(x: pd.DataFrame, y: pd.Series, features: list[str]) -> QuantileModel:
    models = {}
    for q in QUANTILES:
        model = lgb.LGBMRegressor(alpha=q, **PARAMS)
        model.fit(x[features], y)
        models[q] = model
    return QuantileModel(features, models)
