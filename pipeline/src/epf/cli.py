"""Command line entry point: `uv run epf <command>`."""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import duckdb
import pandas as pd

from epf.clean.smard import build_series
from epf.clean.weather import build_weather
from epf.config import (
    BACKTEST_DIR,
    BACKTEST_END,
    BACKTEST_START,
    DEFAULT_SINCE,
    QUALITY_DIR,
    SERIES,
    WEATHER_ARCHIVE_START,
)
from epf.db import connect
from epf.features.asof import DataStore
from epf.features.build import build_range, feature_columns
from epf.ingest import availability, holidays_de, openmeteo, smard
from epf.ingest.http import make_client
from epf.models import backtest
from epf.quality.checks import run_checks, write_report
from epf.timeutil import utcnow


def _day(text: str) -> datetime:
    return datetime.fromisoformat(text)


def cmd_ingest_smard(args: argparse.Namespace) -> int:
    con = connect()
    with make_client() as client:
        for series in SERIES:
            if args.series and series.series_id not in args.series:
                continue
            default = DEFAULT_SINCE["price" if series.kind == "da_price" else "other"]
            smard.ingest_series(con, client, series, args.since or _day(default))
    return 0


def cmd_ingest_weather(args: argparse.Namespace) -> int:
    con = connect()
    today = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    start = args.start or _day(WEATHER_ARCHIVE_START)
    end = args.end or today
    with make_client() as client:
        result = openmeteo.backfill(con, client, start, end)
    logging.info("weather: %s", result)
    return 0


def cmd_ingest_holidays(args: argparse.Namespace) -> int:
    con = connect()
    this_year = utcnow().year
    count = holidays_de.ingest(con, range(2018, this_year + 2))
    logging.info("holidays: %d dates", count)
    return 0


def cmd_clean(args: argparse.Namespace) -> int:
    con = connect()
    for series in SERIES:
        build_series(con, series)
    build_weather(con)
    return 0


def cmd_qc(args: argparse.Namespace) -> int:
    con = connect()
    now = utcnow()
    issues = run_checks(con, now)
    path = write_report(issues, now, QUALITY_DIR)
    for issue in issues:
        print(f"[{issue.severity:7}] {issue.check:18} {issue.subject:18} {issue.message}")
    errors = sum(i.severity == "error" for i in issues)
    print(f"{errors} errors. Report: {path}")
    return 1 if errors else 0


def cmd_poll(args: argparse.Namespace) -> int:
    with make_client() as client:
        path = availability.poll(client)
    print(f"appended to {path}")
    return 0


def cmd_availability_report(args: argparse.Namespace) -> int:
    report = availability.first_seen_report()
    print(report.to_string(index=False) if not report.empty else "No arrivals observed yet.")
    return 0


def cmd_import_raw(args: argparse.Namespace) -> int:
    """Copy raw vintages from another database, such as a separately run backfill."""
    con = connect()
    con.execute(f"ATTACH '{args.path}' AS other (READ_ONLY)")
    before = con.execute("SELECT count(*) FROM raw_response").fetchone()
    con.execute(
        """INSERT INTO raw_response
             (source, request_key, url, fetched_at_utc, http_status, last_modified, etag,
              sha256, body_gz)
           SELECT o.source, o.request_key, o.url, o.fetched_at_utc, o.http_status,
                  o.last_modified, o.etag, o.sha256, o.body_gz
           FROM other.raw_response o
           WHERE NOT EXISTS (
             SELECT 1 FROM raw_response r
             WHERE r.request_key = o.request_key AND r.sha256 = o.sha256)
           ORDER BY o.id"""
    )
    con.execute(
        """INSERT INTO fetch_log
           SELECT * FROM other.fetch_log WHERE note IS NOT NULL
           AND request_key NOT IN (SELECT request_key FROM fetch_log WHERE note IS NOT NULL)"""
    )
    after = con.execute("SELECT count(*) FROM raw_response").fetchone()
    assert before is not None and after is not None
    print(f"imported {after[0] - before[0]} raw responses")
    return 0


def _delivery_days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def cmd_build_features(args: argparse.Namespace) -> int:
    con = connect()
    store = DataStore.load(con)
    first = date.fromisoformat(WEATHER_ARCHIVE_START) + timedelta(days=1)
    last = utcnow().date() + timedelta(days=1)
    df = build_range(store, _delivery_days(first, last))
    df["delivery_date"] = pd.to_datetime(df["delivery_date"])
    con.register("df_features", df)
    con.execute("CREATE OR REPLACE TABLE features AS SELECT * FROM df_features")
    con.unregister("df_features")
    print(f"features: {len(df)} rows, {len(feature_columns(df))} features")
    return 0


def _training_data(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """Features joined to the target. Only this join introduces the price being predicted."""
    data = con.execute(
        """SELECT f.*, p.value AS y FROM features f
           JOIN clean_series p ON p.series_id = 'price_da_60'
            AND p.valid_from_utc = f.valid_from_utc
           ORDER BY f.valid_from_utc"""
    ).fetchdf()
    data["delivery_date"] = pd.to_datetime(data["delivery_date"]).dt.date
    return data


def cmd_backtest(args: argparse.Namespace) -> int:
    con = connect()
    data = _training_data(con)
    start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)
    predictions, importance, version = backtest.walk_forward(data, start, end)
    predictions = predictions.merge(
        data[["valid_from_utc", "day_hours"]], on="valid_from_utc", how="left"
    )
    predictions = backtest.baseline_intervals(data, predictions)
    report = backtest.build_report(
        predictions,
        importance,
        version,
        start,
        end,
        data["delivery_date"].min(),
        len(feature_columns(data.drop(columns=["y"]))),
    )
    path = backtest.write_report(report, predictions, BACKTEST_DIR)
    print(f"report: {path}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="epf", description=__doc__)
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("ingest-smard", help="fetch new and recent SMARD chunks (idempotent)")
    p.add_argument("--since", type=_day, help="backfill start, YYYY-MM-DD")
    p.add_argument("--series", nargs="*", help="limit to these series IDs")
    p.set_defaults(func=cmd_ingest_smard)

    p = sub.add_parser("ingest-weather", help="fetch weather runs (resumable backfill)")
    p.add_argument("--start", type=_day)
    p.add_argument("--end", type=_day)
    p.set_defaults(func=cmd_ingest_weather)

    p = sub.add_parser("ingest-holidays", help="load German public holidays")
    p.set_defaults(func=cmd_ingest_holidays)

    p = sub.add_parser("clean", help="rebuild cleaned tables from raw responses")
    p.set_defaults(func=cmd_clean)

    p = sub.add_parser("qc", help="run data quality checks; exits 1 on errors")
    p.set_defaults(func=cmd_qc)

    p = sub.add_parser("import-raw", help="copy raw vintages from another DuckDB file")
    p.add_argument("path", type=Path)
    p.set_defaults(func=cmd_import_raw)

    p = sub.add_parser("build-features", help="rebuild the as-of feature table")
    p.set_defaults(func=cmd_build_features)

    p = sub.add_parser("backtest", help="walk-forward backtest with baselines")
    p.add_argument("--start", default=BACKTEST_START)
    p.add_argument("--end", default=BACKTEST_END)
    p.set_defaults(func=cmd_backtest)

    p = sub.add_parser("poll-availability", help="log when SMARD files change (no market values)")
    p.set_defaults(func=cmd_poll)

    p = sub.add_parser("availability-report", help="summarise the availability log")
    p.set_defaults(func=cmd_availability_report)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
