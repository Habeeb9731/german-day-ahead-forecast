"""Static configuration: series registry, weather locations and availability rules.

Filter IDs were confirmed by live requests on 2026-11-02. Filter 411 (demand forecast) is absent
from the community OpenAPI spec; its identity is inferred from behaviour (see README).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = Path(os.environ.get("EPF_DATA_DIR", REPO_ROOT / "data"))
DEFAULT_DB_PATH = DATA_DIR / "epf.duckdb"
AVAILABILITY_DIR = DATA_DIR / "availability"
QUALITY_DIR = DATA_DIR / "quality"
BACKTEST_DIR = DATA_DIR / "backtest"
FORECAST_LOG_DIR = DATA_DIR / "forecast_log"
MODEL_DIR = DATA_DIR / "models"
EXPORT_DIR = Path(os.environ.get("EPF_EXPORT_DIR", REPO_ROOT / "dashboard" / "public" / "data"))


def db_path() -> Path:
    return Path(os.environ.get("EPF_DB_PATH", DEFAULT_DB_PATH))


SMARD_BASE = "https://www.smard.de/app/chart_data"
OPEN_METEO_SINGLE_RUNS = "https://single-runs-api.open-meteo.com/v1/forecast"
USER_AGENT = "epf-research/0.1 (github.com/Habeeb9731/german-day-ahead-forecast)"

Kind = Literal["da_price", "load_forecast", "res_forecast", "actual"]
Resolution = Literal["hour", "quarterhour"]


@dataclass(frozen=True)
class Series:
    """A SMARD series. `critical` series fail the pipeline on quality errors; others warn."""

    series_id: str
    filter_id: int
    resolution: Resolution
    kind: Kind
    unit: str  # unit of the cleaned value
    critical: bool
    min_value: float
    max_value: float


# Price limits: -500 EUR/MWh is the lowest value seen in SMARD's history and 4000 is a generous
# ceiling. Values outside them are flagged rather than dropped. Negative prices are valid.
SERIES: tuple[Series, ...] = (
    Series("price_da_60", 4169, "hour", "da_price", "EUR/MWh", True, -500, 4000),
    Series("price_da_15", 4169, "quarterhour", "da_price", "EUR/MWh", True, -500, 4000),
    Series("load_forecast", 411, "hour", "load_forecast", "MW", True, 20_000, 110_000),
    Series("load_actual", 410, "hour", "actual", "MW", False, 20_000, 110_000),
    Series("residual_actual", 4359, "hour", "actual", "MW", False, -60_000, 110_000),
    Series("wind_on_forecast", 123, "hour", "res_forecast", "MW", False, 0, 90_000),
    Series("wind_off_forecast", 3791, "hour", "res_forecast", "MW", False, 0, 20_000),
    Series("pv_forecast", 125, "hour", "res_forecast", "MW", False, 0, 150_000),
    Series("wind_on_actual", 4067, "hour", "actual", "MW", False, 0, 90_000),
    Series("wind_off_actual", 1225, "hour", "actual", "MW", False, 0, 20_000),
    Series("pv_actual", 4068, "hour", "actual", "MW", False, 0, 150_000),
)
SERIES_BY_ID = {s.series_id: s for s in SERIES}

# SDAC moved to 15-minute MTUs for delivery on 2025-10-01 00:00 Europe/Berlin. SMARD's quarter-hour
# price series before this instant only repeats the hourly value, so it is not used.
PRICE_15MIN_START_UTC = "2025-09-30T22:00:00"

# Earliest history pulled by default. Prices are fetched in full so the resolution check covers
# the whole series; everything else only needs to precede the weather archive (2024-03-14).
DEFAULT_SINCE = {"price": "2018-09-30", "other": "2023-01-01"}

# Availability rules, as local times on the day before delivery. Deliberately conservative and to
# be confirmed by the availability log (data/availability). Times are Europe/Berlin.
RULE_LOAD_FORECAST = (10, 15)  # file observed modified at 10:01 on 2026-11-02
RULE_RES_FORECAST = (18, 30)  # file observed modified at 17:39 on 2026-11-02
RULE_DA_PRICE = (20, 0)  # auction results arrive after 12:00; SMARD's exact lag is unmeasured
ACTUAL_DELAY_HOURS = 3  # actuals were observed roughly 1 hour behind real time

# Weather: ECMWF IFS HRES through the Open-Meteo Single Runs API.
WEATHER_MODEL = "ecmwf_ifs"
WEATHER_ARCHIVE_START = "2024-03-14"
WEATHER_VARIABLES = ("wind_speed_100m", "shortwave_radiation", "temperature_2m", "cloud_cover")
WEATHER_UNITS = {
    "wind_speed_100m": "km/h",
    "shortwave_radiation": "W/m²",
    "temperature_2m": "°C",
    "cloud_cover": "%",
}
# 00 UTC + 48h reaches the end of delivery; the 18 UTC fallback run needs 54h for the same hour.
WEATHER_FORECAST_HOURS = 54
WEATHER_RUN_DELAY_HOURS = 6  # docs: 4-6h for global models; confirm against the live log


@dataclass(frozen=True)
class Location:
    name: str
    latitude: float
    longitude: float


WEATHER_LOCATIONS: tuple[Location, ...] = (
    Location("north_sea_coast", 54.5, 7.5),
    Location("hamburg", 53.5, 10.0),
    Location("berlin", 52.5, 13.4),
    Location("central", 51.0, 8.5),
    Location("karlsruhe", 49.0, 8.5),
    Location("munich", 48.0, 11.5),
)

# Forecast cutoff: Berlin wall-clock time on the day before delivery. The auction closes at 12:00.
CUTOFF_LOCAL = (11, 30)
# Live runs may start from this time. Earlier, the day's demand forecast may not be published yet.
RUN_WINDOW_START_LOCAL = (10, 15)

# Walk-forward backtest window: the most recent 12 complete months at build time.
BACKTEST_START = "2025-11-01"
BACKTEST_END = "2026-10-31"
