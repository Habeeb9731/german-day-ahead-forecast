"""Write the JSON files the dashboard reads. Live results and backtest results stay in separate
files, and each file replaces the old one atomically so visitors never see a partial write."""

from __future__ import annotations

import json
import math
import os
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from epf.live import forecast_log

# The home and EV pages only need recent history: a 7-day rolling chart of 60 days, plus a margin.
RECENT_BACKTEST_DAYS = 70


def _write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, allow_nan=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def _number(value: object) -> float | None:
    if value is None:
        return None
    number = float(value)  # type: ignore[arg-type]
    return None if math.isnan(number) else round(number, 2)


def export_tomorrow(log_root: Path, out: Path) -> bool:
    """Export the newest log entry, even if it says the day was missed. The dashboard compares its
    date with the clock, so an old entry can never pass as a new forecast."""
    items = forecast_log.entries(log_root)
    if not items:
        return False
    latest = items[-1].data
    _write(
        out / "tomorrow.json",
        {
            "kind": "live_forecast",
            "is_sample": False,
            "status": latest["status"],
            "delivery_date": latest["delivery_date"],
            "generated_at_utc": latest["generated_at_utc"],
            "cutoff_utc": latest["cutoff_utc"],
            "model_version": latest["model_version"] or "none",
            "hours": latest["hours"],
        },
    )
    return True


def export_track_record(scores: pd.DataFrame, out: Path, now: datetime) -> None:
    records = scores.sort_values("valid_from_utc").to_dict("records")
    rows = [
        {
            "valid_from_utc": pd.Timestamp(r["valid_from_utc"]).isoformat(timespec="seconds"),
            "delivery_date": pd.Timestamp(r["delivery_date"]).date().isoformat(),
            "p10": _number(r["p10"]),
            "p50": _number(r["p50"]),
            "p90": _number(r["p90"]),
            "actual": _number(r["actual"]),
            "baseline_prev_day": _number(r["baseline_prev_day"]),
            "baseline_prev_week": _number(r["baseline_prev_week"]),
            "model_version": r["model_version"],
            "forecast_generated_at_utc": r["forecast_generated_at_utc"],
        }
        for r in records
    ]
    _write(
        out / "track_record.json",
        {
            "kind": "live_track_record",
            "is_sample": False,
            "generated_at_utc": now.isoformat(timespec="seconds"),
            "hours": rows,
        },
    )


def export_backtest(report_path: Path, out: Path) -> bool:
    if not report_path.exists():
        return False
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if report.get("kind") != "backtest":
        raise ValueError(f"{report_path} is not a backtest report")
    report["is_sample"] = False
    _write(out / "backtest.json", report)
    return True


def export_backtest_track(predictions_path: Path, version: str, out: Path, now: datetime) -> bool:
    """Hourly backtest forecasts with actual prices, in their own file and clearly marked, so the
    dashboard can show history without mixing it into the live record."""
    if not predictions_path.exists():
        return False
    df = pd.read_parquet(predictions_path).sort_values("valid_from_utc")
    rows = _backtest_rows(df.to_dict("records"), version)
    days = sorted({row["delivery_date"] for row in rows})
    recent_from = days[-RECENT_BACKTEST_DAYS:][0] if days else ""
    for name, hours in (
        ("backtest_track.json", rows),
        ("backtest_recent.json", [row for row in rows if row["delivery_date"] >= recent_from]),
    ):
        _write(
            out / name,
            {
                "kind": "backtest_track_record",
                "is_sample": False,
                "note": "Simulated walk-forward forecasts, not live forecasts.",
                "generated_at_utc": now.isoformat(timespec="seconds"),
                "hours": hours,
            },
        )
    return True


def _backtest_rows(records: list[Any], version: str) -> list[dict[str, Any]]:
    return [
        {
            "valid_from_utc": pd.Timestamp(r["valid_from_utc"]).isoformat(timespec="seconds"),
            "delivery_date": pd.Timestamp(r["delivery_date"]).date().isoformat(),
            "p10": _number(r["p10"]),
            "p50": _number(r["p50"]),
            "p90": _number(r["p90"]),
            "actual": _number(r["y"]),
            "baseline_prev_day": _number(r["baseline_prev_day"]),
            "baseline_prev_week": _number(r["baseline_prev_week"]),
            "model_version": version,
            "forecast_generated_at_utc": None,
        }
        for r in records
    ]


def clear_sample_data(out: Path) -> None:
    """Remove synthetic files from an output folder before real exports are written."""
    if not out.exists():
        return
    for path in out.glob("*.json"):
        if json.loads(path.read_text(encoding="utf-8")).get("is_sample") is True:
            path.unlink()


__all__ = [
    "clear_sample_data",
    "export_backtest",
    "export_backtest_track",
    "export_tomorrow",
    "export_track_record",
]
