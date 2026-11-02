"""Command line entry point: `uv run epf <command>`."""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime

from epf.clean.smard import build_series
from epf.clean.weather import build_weather
from epf.config import DEFAULT_SINCE, QUALITY_DIR, SERIES, WEATHER_ARCHIVE_START
from epf.db import connect
from epf.ingest import availability, holidays_de, openmeteo, smard
from epf.ingest.http import make_client
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
