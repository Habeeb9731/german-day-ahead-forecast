"""Build one feature row per delivery hour, using only data available at the forecast cutoff.

Delivery day D has its cutoff at 11:30 Berlin on D-1. Inputs:

| Group            | Source               | Reach                                             |
|------------------|----------------------|---------------------------------------------------|
| calendar         | clock, holidays      | known in advance                                  |
| price lags       | price_da_60          | D-1 and earlier (published the previous afternoon)|
| demand forecast  | load_forecast        | D itself, published by 10:15 on D-1               |
| renewables fcst  | wind/PV forecast     | D-1 only: D is published after the auction closes |
| actuals          | load, wind, PV       | D-2 only                                          |
| weather          | ECMWF 00 UTC on D-1  | D, or the 18 UTC run on D-2 if that run is missing|
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd

from epf.config import WEATHER_LOCATIONS
from epf.features.asof import AsOf, DataStore, cutoff_for
from epf.timeutil import BERLIN, delivery_bounds_utc

log = logging.getLogger(__name__)

META_COLUMNS = (
    "delivery_date",
    "valid_from_utc",
    "cutoff_utc",
    "max_input_available_at_utc",
    "weather_run_utc",
)
PRICE_LAG_DAYS = (1, 2, 7, 14)
RES_FORECAST_SERIES = ("wind_on_forecast", "wind_off_forecast", "pv_forecast")
ACTUAL_SERIES = ("load_actual", "residual_actual", "wind_on_actual", "wind_off_actual", "pv_actual")


def local_keys(valid_utc: pd.Series) -> pd.DataFrame:
    """Berlin date and wall-clock hour for UTC timestamps."""
    local = valid_utc.dt.tz_localize("UTC").dt.tz_convert(BERLIN)
    return pd.DataFrame({"date": local.dt.date, "hour": local.dt.hour}, index=valid_utc.index)


def by_local_hour(df: pd.DataFrame) -> dict[tuple[date, int], float]:
    """Map (Berlin date, hour) to value. The repeated hour on a 25-hour day is averaged."""
    if df.empty:
        return {}
    keys = local_keys(df["valid_from_utc"])
    grouped = (
        pd.DataFrame({"date": keys["date"], "hour": keys["hour"], "value": df["value"]})
        .groupby(["date", "hour"], as_index=False)["value"]
        .mean()
    )
    return {
        (d, int(h)): float(v)
        for d, h, v in zip(grouped["date"], grouped["hour"], grouped["value"], strict=True)
    }


def same_hour(table: dict[tuple[date, int], float], day: date, hour: int) -> float:
    """Value at the same Berlin hour on `day`. A 23-hour day has no 02:00, so it uses 03:00."""
    value = table.get((day, hour))
    if value is None and hour == 2:
        value = table.get((day, 3))
    return np.nan if value is None else value


def _daily(table: dict[tuple[date, int], float], day: date) -> list[float]:
    return [v for (d, _), v in table.items() if d == day]


def weather_features(frame: pd.DataFrame, run: datetime, hours: pd.DatetimeIndex) -> pd.DataFrame:
    """Wide weather features for the delivery hours: per location plus national summaries."""
    wide = frame.pivot_table(
        index="valid_utc", columns=["variable", "location"], values="value", aggfunc="first"
    ).reindex(hours)
    out = pd.DataFrame(index=hours)
    for var in ("wind_speed_100m", "shortwave_radiation", "temperature_2m", "cloud_cover"):
        for loc in WEATHER_LOCATIONS:
            column = (var, loc.name)
            out[f"wx_{var}_{loc.name}"] = wide.get(column, np.nan)
        cols = [f"wx_{var}_{loc.name}" for loc in WEATHER_LOCATIONS]
        out[f"wx_{var}_mean"] = out[cols].mean(axis=1)
    wind = [f"wx_wind_speed_100m_{loc.name}" for loc in WEATHER_LOCATIONS]
    out["wx_wind_cubed_mean"] = (out[wind] ** 3).mean(axis=1)
    out["wx_wind_spread"] = out[wind].std(axis=1)
    out["wx_lead_hours"] = (hours - pd.Timestamp(run)) / pd.Timedelta(hours=1)
    return out


def build_day(store: DataStore, delivery: date) -> pd.DataFrame:
    """Feature rows for one delivery date. All data access goes through `AsOf`."""
    cutoff = cutoff_for(delivery)
    view = AsOf(store, cutoff)
    start, end = delivery_bounds_utc(delivery)
    hours = pd.date_range(start, end, freq="60min", inclusive="left")
    keys = local_keys(pd.Series(hours))
    out = pd.DataFrame(index=hours)
    out["delivery_date"] = delivery
    out["valid_from_utc"] = hours
    out["cutoff_utc"] = cutoff

    # Calendar: known in advance, needs no data availability check.
    hour_values = keys["hour"].to_numpy()
    out["hour"] = hour_values
    out["dow"] = delivery.weekday()
    out["month"] = delivery.month
    out["day_of_year"] = delivery.timetuple().tm_yday
    out["is_weekend"] = int(delivery.weekday() >= 5)
    out["day_hours"] = len(hours)
    hol = store.holidays
    dates = (
        pd.to_datetime(hol["holiday_date"]).dt.date if not hol.empty else pd.Series(dtype=object)
    )

    def share(day: date) -> float:
        match = hol.loc[dates == day, "state_share"]
        return float(match.iloc[0]) if not match.empty else 0.0

    out["holiday_share"] = share(delivery)
    out["holiday_share_prev"] = share(delivery - timedelta(days=1))
    out["holiday_share_next"] = share(delivery + timedelta(days=1))

    # Price lags and recent price statistics.
    window_start, _ = delivery_bounds_utc(delivery - timedelta(days=28))
    prices = by_local_hour(view.series("price_da_60", window_start, end))
    for lag in PRICE_LAG_DAYS:
        day = delivery - timedelta(days=lag)
        out[f"price_lag_{lag}d"] = [same_hour(prices, day, h) for h in hour_values]
    prior = _daily(prices, delivery - timedelta(days=1))
    out["price_prev_mean"] = np.mean(prior) if prior else np.nan
    out["price_prev_min"] = np.min(prior) if prior else np.nan
    out["price_prev_max"] = np.max(prior) if prior else np.nan
    out["price_prev_std"] = np.std(prior) if prior else np.nan
    out["price_prev_negative_hours"] = sum(v < 0 for v in prior) if prior else np.nan
    last_7 = [v for (d, _), v in prices.items() if d >= delivery - timedelta(days=7)]
    last_28 = list(prices.values())
    out["price_mean_7d"] = np.mean(last_7) if last_7 else np.nan
    out["price_mean_28d"] = np.mean(last_28) if last_28 else np.nan
    out["price_same_hour_mean_7d"] = [
        np.nanmean([same_hour(prices, delivery - timedelta(days=i), h) for i in range(1, 8)])
        if last_7
        else np.nan
        for h in hour_values
    ]

    # Demand forecast for the delivery day, plus the previous day's for comparison.
    prev_start, _ = delivery_bounds_utc(delivery - timedelta(days=1))
    load = view.series("load_forecast", prev_start, end)
    load_table = by_local_hour(load)
    today_load = load.loc[load["valid_from_utc"] >= start].set_index("valid_from_utc")["value"]
    out["load_fc"] = today_load.reindex(hours).to_numpy()
    out["load_fc_prev"] = [
        same_hour(load_table, delivery - timedelta(days=1), h) for h in hour_values
    ]
    out["load_fc_delta"] = out["load_fc"] - out["load_fc_prev"]
    out["load_fc_day_mean"] = out["load_fc"].mean()
    out["load_fc_day_max"] = out["load_fc"].max()

    # Renewable forecasts for D-1 only. Availability rules hide D from this view.
    total = np.zeros(len(hours))
    for sid in RES_FORECAST_SERIES:
        table = by_local_hour(view.series(sid, prev_start, start))
        vals = [same_hour(table, delivery - timedelta(days=1), h) for h in hour_values]
        out[f"{sid}_prev"] = vals
        total = total + np.array(vals, dtype=float)
    out["res_forecast_prev_total"] = total
    out["res_forecast_prev_day_mean"] = np.nanmean(total) if np.isfinite(total).any() else np.nan

    # Actuals through D-2 only.
    d2 = delivery - timedelta(days=2)
    d2_start, d2_end = delivery_bounds_utc(d2)
    for sid in ACTUAL_SERIES:
        table = by_local_hour(view.series(sid, d2_start, d2_end))
        out[f"{sid}_d2"] = [same_hour(table, d2, h) for h in hour_values]
        values = _daily(table, d2)
        out[f"{sid}_d2_mean"] = np.mean(values) if values else np.nan

    # Weather: the 00 UTC run on D-1, or the previous evening's 18 UTC run if that is missing.
    prev = delivery - timedelta(days=1)
    midnight = datetime(prev.year, prev.month, prev.day)  # noqa: DTZ001 (naive UTC run time)
    chosen = view.weather_run([midnight, midnight - timedelta(hours=6)])
    if chosen is None:
        out["weather_run_utc"] = pd.NaT
        out = out.join(weather_features(_EMPTY_WEATHER, midnight, hours))
    else:
        run, frame = chosen
        out["weather_run_utc"] = pd.Timestamp(run)
        out = out.join(weather_features(frame, run, hours))

    view.assert_clean()
    out["max_input_available_at_utc"] = view.max_available_at
    return out.reset_index(drop=True)


_EMPTY_WEATHER = pd.DataFrame(
    {
        "valid_utc": pd.Series(dtype="datetime64[ns]"),
        "location": pd.Series(dtype=object),
        "variable": pd.Series(dtype=object),
        "value": pd.Series(dtype=float),
    }
)


def feature_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c not in META_COLUMNS]


def build_range(store: DataStore, dates: Iterable[date]) -> pd.DataFrame:
    frames = [build_day(store, d) for d in dates]
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
