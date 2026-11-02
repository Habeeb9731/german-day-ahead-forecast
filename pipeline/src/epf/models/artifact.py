"""Save and load trained quantile models for live forecasting."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from epf.models import calibrate, lgbm


@dataclass(frozen=True)
class LiveModel:
    version: str
    trained_through: date
    features: list[str]
    boosters: dict[float, lgb.Booster]
    adjustments: dict[str, float]

    def predict(self, x: pd.DataFrame) -> pd.DataFrame:
        """P10, P50 and P90, sorted because separately fitted quantiles can cross."""
        raw = np.column_stack([self.boosters[q].predict(x[self.features]) for q in lgbm.QUANTILES])
        raw.sort(axis=1)
        predicted = pd.DataFrame(raw, columns=["p10", "p50", "p90"], index=x.index)
        return calibrate.apply(predicted, x["hour"], self.adjustments)


def train_and_save(data: pd.DataFrame, features: list[str], root: Path) -> Path:
    """Train on all rows with a known target. `data` must hold `delivery_date` and `y`."""
    known = data.dropna(subset=["y"])
    trained_through: date = known["delivery_date"].max()
    version = f"{lgbm.model_version(features)}@{trained_through.isoformat()}"
    next_day = trained_through + timedelta(days=1)
    fit_rows, holdout = calibrate.holdout_split(known, next_day)
    adjustments = calibrate.fit(
        holdout, lgbm.train(fit_rows, fit_rows["y"], features).predict(holdout)
    )
    model = lgbm.train(known, known["y"], features)
    out = root / version
    out.mkdir(parents=True, exist_ok=True)
    for q in lgbm.QUANTILES:
        model.models[q].booster_.save_model(str(out / f"q{int(q * 100)}.txt"))
    (out / "manifest.json").write_text(
        json.dumps(
            {
                "version": version,
                "trained_through": trained_through.isoformat(),
                "features": features,
                "rows": len(known),
                "calibration": adjustments,
            },
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    return out


def load_latest(root: Path) -> LiveModel | None:
    manifests = [json.loads(p.read_text()) for p in root.glob("*/manifest.json")]
    if not manifests:
        return None
    newest = max(manifests, key=lambda m: m["trained_through"])
    folder = root / newest["version"]
    boosters = {
        q: lgb.Booster(model_file=str(folder / f"q{int(q * 100)}.txt")) for q in lgbm.QUANTILES
    }
    return LiveModel(
        newest["version"],
        date.fromisoformat(newest["trained_through"]),
        newest["features"],
        boosters,
        newest["calibration"],
    )
