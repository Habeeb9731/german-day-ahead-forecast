"""The daily forecast decision: forecast, wait, or record a missed day. Never publish stale data."""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Literal

import pandas as pd

from epf.config import RUN_WINDOW_START_LOCAL
from epf.features.asof import DataStore, cutoff_for
from epf.features.build import build_day
from epf.live import forecast_log
from epf.models.artifact import LiveModel
from epf.timeutil import delivery_date, delivery_hours, local_time_on

log = logging.getLogger(__name__)

Outcome = Literal["published", "already_logged", "too_early", "not_ready", "missed"]


class ForecastNotReady(RuntimeError):
    """Inputs for the delivery day are missing or incomplete."""


@dataclass(frozen=True)
class Decision:
    outcome: Outcome
    delivery: date
    detail: str = ""

    @property
    def failed(self) -> bool:
        return self.outcome in {"not_ready", "missed"}


def target_delivery(now: datetime) -> date:
    return delivery_date(now) + timedelta(days=1)


def check_ready(features: pd.DataFrame, delivery: date) -> None:
    """Refuse to forecast from incomplete inputs. Trees accept NaN, so this must be explicit."""
    expected = delivery_hours(delivery)
    if len(features) != expected:
        raise ForecastNotReady(f"expected {expected} hours, built {len(features)}")
    if features["load_fc"].isna().any():
        raise ForecastNotReady("demand forecast for the delivery day is incomplete")
    if features["price_lag_1d"].isna().any():
        raise ForecastNotReady("previous day's prices are incomplete")
    if features["weather_run_utc"].isna().any():
        raise ForecastNotReady("no weather run was available at the cutoff")
    weather = [c for c in features.columns if c.startswith("wx_") and c != "wx_lead_hours"]
    missing = float(features[weather].isna().mean().mean())
    if missing > 0.05:
        raise ForecastNotReady(f"{missing:.0%} of weather values are missing")


def input_hash(features: pd.DataFrame, columns: list[str]) -> str:
    text = features[columns].round(6).to_csv(index=False)
    return hashlib.sha256(text.encode()).hexdigest()


def forecast_hours(features: pd.DataFrame, model: LiveModel) -> list[dict[str, Any]]:
    predicted = model.predict(features).to_dict("records")
    return [
        {
            "valid_from_utc": pd.Timestamp(valid).isoformat(timespec="seconds"),
            "p10": round(row["p10"], 2),
            "p50": round(row["p50"], 2),
            "p90": round(row["p90"], 2),
        }
        for valid, row in zip(features["valid_from_utc"], predicted, strict=True)
    ]


def _record_missed(root: Path, delivery: date, now: datetime, reason: str) -> Decision:
    forecast_log.append(
        root, delivery, "missed", now, cutoff_for(delivery), None, reason=reason[:300]
    )
    return Decision("missed", delivery, reason)


def run_forecast(
    now: datetime,
    log_root: Path,
    store: DataStore | None,
    model: LiveModel | None,
    failure: str | None = None,
) -> Decision:
    """Decide for the next delivery day at `now`. `failure` carries an upstream error, such as
    failed ingestion or quality checks. Before the cutoff, a problem leaves the day open for a later retry.
    After the cutoff, the day is recorded as missed and no forecast is produced."""
    delivery = target_delivery(now)
    if forecast_log.exists(log_root, delivery):
        return Decision("already_logged", delivery)
    cutoff = cutoff_for(delivery)
    if now > cutoff:
        return _record_missed(
            log_root, delivery, now, failure or "no run finished before the cutoff"
        )
    start = local_time_on(delivery - timedelta(days=1), *RUN_WINDOW_START_LOCAL)
    if now < start:
        return Decision("too_early", delivery)
    if failure:
        return Decision("not_ready", delivery, failure)
    if store is None or model is None:
        return Decision("not_ready", delivery, "data or model is not available")
    features = build_day(store, delivery)
    try:
        check_ready(features, delivery)
    except ForecastNotReady as exc:
        return Decision("not_ready", delivery, str(exc))
    forecast_log.append(
        log_root,
        delivery,
        "ok",
        now,
        cutoff,
        model.version,
        input_hash=input_hash(features, model.features),
        hours=forecast_hours(features, model),
    )
    return Decision("published", delivery)
