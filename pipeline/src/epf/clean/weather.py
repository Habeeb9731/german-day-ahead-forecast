"""Turn stored Single Runs responses into `weather_run`, keeping each run's issue time."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

import duckdb
import pandas as pd

from epf.config import WEATHER_RUN_DELAY_HOURS
from epf.ingest.openmeteo import SOURCE, parse_run
from epf.ingest.raw import decode

log = logging.getLogger(__name__)


def run_from_key(key: str) -> datetime:
    return datetime.strptime(key.rsplit(":", 1)[1], "%Y-%m-%dT%H")  # noqa: DTZ007 (naive UTC)


def build_weather(con: duckdb.DuckDBPyConnection) -> int:
    """Load vintages not yet in `weather_run`. If a run changed, the newest vintage replaces it."""
    rows = con.execute(
        """SELECT id, request_key, body_gz FROM raw_response r
           WHERE source = ?
             AND id = (SELECT max(id) FROM raw_response x WHERE x.request_key = r.request_key)
             AND id NOT IN (SELECT DISTINCT raw_id FROM weather_run)
           ORDER BY id""",
        [SOURCE],
    ).fetchall()
    total = 0
    for raw_id, key, body in rows:
        run = run_from_key(key)
        df = pd.DataFrame(
            parse_run(decode(body)), columns=["valid_utc", "location", "variable", "value"]
        )
        df["run_utc"] = run
        df["available_at_utc"] = run + timedelta(hours=WEATHER_RUN_DELAY_HOURS)
        df["raw_id"] = raw_id
        con.execute("BEGIN")
        con.execute("DELETE FROM weather_run WHERE run_utc = ?", [run])
        con.register("df_weather", df)
        con.execute(
            """INSERT INTO weather_run
               SELECT run_utc, valid_utc, location, variable, value, available_at_utc, raw_id
               FROM df_weather"""
        )
        con.unregister("df_weather")
        con.execute("COMMIT")
        total += len(df)
    log.info("weather: %d new rows from %d runs", total, len(rows))
    return total
