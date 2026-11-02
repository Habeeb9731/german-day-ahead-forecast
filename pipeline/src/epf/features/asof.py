"""As-of data access. Feature code reads inputs only through `AsOf`, which hides anything not
available at the cutoff and records the newest availability time it handed out."""

from __future__ import annotations

from datetime import date, datetime, timedelta

import duckdb
import pandas as pd

from epf.config import CUTOFF_LOCAL
from epf.timeutil import local_time_on


class LeakageError(RuntimeError):
    """A feature row depends on data that was not available at its cutoff."""


def cutoff_for(delivery: date) -> datetime:
    """Forecast cutoff for a Berlin delivery date, in naive UTC."""
    return local_time_on(delivery - timedelta(days=1), *CUTOFF_LOCAL)


class DataStore:
    """All cleaned inputs in memory, unfiltered. Only `AsOf` should read from it."""

    def __init__(
        self,
        series: dict[str, pd.DataFrame],
        weather: pd.DataFrame,
        holidays: pd.DataFrame,
    ) -> None:
        self.series = series
        self.weather = {run: frame for run, frame in weather.groupby("run_utc")}
        self.holidays = holidays

    @classmethod
    def load(cls, con: duckdb.DuckDBPyConnection) -> DataStore:
        df = con.execute(
            """SELECT series_id, valid_from_utc, value, available_at_utc FROM clean_series
               WHERE series_id <> 'price_da_15' ORDER BY series_id, valid_from_utc"""
        ).fetchdf()
        series = {
            str(k): g.drop(columns="series_id").reset_index(drop=True)
            for k, g in df.groupby("series_id")
        }
        weather = con.execute(
            """SELECT run_utc, valid_utc, location, variable, value, available_at_utc
               FROM weather_run"""
        ).fetchdf()
        holidays = con.execute("SELECT * FROM holiday").fetchdf()
        return cls(series, weather, holidays)


class AsOf:
    """A view of the store as it stood at `cutoff`."""

    def __init__(self, store: DataStore, cutoff: datetime) -> None:
        self._store = store
        self.cutoff = pd.Timestamp(cutoff)
        self.max_available_at = pd.Timestamp.min

    def _touch(self, available: pd.Series) -> None:
        if not available.empty:
            self.max_available_at = max(self.max_available_at, available.max())

    def series(self, series_id: str, start: datetime, end: datetime) -> pd.DataFrame:
        """Values with valid time in [start, end) that were available at the cutoff."""
        df = self._store.series.get(series_id)
        if df is None:
            return pd.DataFrame(columns=["valid_from_utc", "value", "available_at_utc"])
        mask = (
            (df["valid_from_utc"] >= start)
            & (df["valid_from_utc"] < end)
            & (df["available_at_utc"] <= self.cutoff)
        )
        out = df.loc[mask]
        self._touch(out["available_at_utc"])
        return out

    def weather_run(self, preferred: list[datetime]) -> tuple[datetime, pd.DataFrame] | None:
        """The first listed run that exists and was available at the cutoff."""
        for run in preferred:
            frame = self._store.weather.get(pd.Timestamp(run))
            if frame is None:
                continue
            frame = frame.loc[frame["available_at_utc"] <= self.cutoff]
            if frame.empty:
                continue
            self._touch(frame["available_at_utc"])
            return run, frame
        return None

    def assert_clean(self) -> None:
        if self.max_available_at > self.cutoff:
            raise LeakageError(f"used data from {self.max_available_at}, cutoff {self.cutoff}")
