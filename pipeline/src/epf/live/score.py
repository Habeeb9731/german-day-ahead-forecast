"""Score logged forecasts against published prices. Results are derived and rebuilt on each run,
so the forecast log itself is only ever read here."""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path

import duckdb
import pandas as pd

from epf.features.build import by_local_hour, local_keys, same_hour
from epf.live import forecast_log
from epf.timeutil import delivery_hours

SCORE_COLUMNS = [
    "delivery_date",
    "valid_from_utc",
    "p10",
    "p50",
    "p90",
    "actual",
    "baseline_prev_day",
    "baseline_prev_week",
    "model_version",
    "forecast_generated_at_utc",
]


def score_entries(log_root: Path, prices: pd.DataFrame) -> pd.DataFrame:
    """One row per hour of each logged forecast whose delivery day has complete actual prices.
    Partly published days wait. Baselines use the same local-hour rule as the features."""
    table = by_local_hour(prices)
    actual = prices.set_index("valid_from_utc")["value"]
    rows: list[dict[str, object]] = []
    for entry in forecast_log.entries(log_root):
        if entry.data["status"] != "ok":
            continue
        day = entry.delivery_date
        hours = pd.DataFrame(entry.data["hours"])
        hours["valid_from_utc"] = pd.to_datetime(hours["valid_from_utc"])
        values = actual.reindex(hours["valid_from_utc"])
        if values.isna().any() or len(hours) != delivery_hours(day):
            continue
        local = local_keys(hours["valid_from_utc"])
        for i, row in enumerate(hours.itertuples()):
            hour = int(local["hour"].iloc[i])
            rows.append(
                {
                    "delivery_date": day,
                    "valid_from_utc": row.valid_from_utc,
                    "p10": row.p10,
                    "p50": row.p50,
                    "p90": row.p90,
                    "actual": float(values.iloc[i]),
                    "baseline_prev_day": same_hour(table, day - timedelta(days=1), hour),
                    "baseline_prev_week": same_hour(table, day - timedelta(days=7), hour),
                    "model_version": entry.data["model_version"],
                    "forecast_generated_at_utc": entry.data["generated_at_utc"],
                }
            )
    return pd.DataFrame(rows, columns=SCORE_COLUMNS)


def rebuild_scores(con: duckdb.DuckDBPyConnection, log_root: Path) -> pd.DataFrame:
    prices = con.execute(
        """SELECT valid_from_utc, value FROM clean_series
           WHERE series_id = 'price_da_60' ORDER BY valid_from_utc"""
    ).fetchdf()
    scores = score_entries(log_root, prices)
    con.register("df_scores", scores)
    con.execute("CREATE OR REPLACE TABLE scores AS SELECT * FROM df_scores")
    con.unregister("df_scores")
    return scores
