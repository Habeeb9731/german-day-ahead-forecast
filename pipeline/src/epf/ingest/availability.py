"""Measure when SMARD publishes each series.

Each poll appends file metadata to a JSONL log kept in git. It records timestamps and hashes only,
never market values, so the log stays publishable whatever the outcome of the price licensing
question.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from pathlib import Path

import httpx
import pandas as pd

from epf.config import AVAILABILITY_DIR, SERIES, Series
from epf.ingest.http import fetch
from epf.ingest.smard import chunk_url, index_url, parse_chunk, parse_index
from epf.timeutil import BERLIN, delivery_date, utcnow

POLLED = tuple(s for s in SERIES if s.resolution == "hour")


def poll_series(client: httpx.Client, series: Series, polled_at: datetime) -> dict[str, object]:
    latest = parse_index(fetch(client, index_url(series)).body)[-1]
    response = fetch(client, chunk_url(series, latest))
    rows = [(t, v) for t, v in parse_chunk(response.body) if v is not None]
    last_valid = max(t for t, _ in rows) if rows else None
    return {
        "polled_at_utc": polled_at.isoformat(timespec="seconds"),
        "series_id": series.series_id,
        "filter_id": series.filter_id,
        "chunk_ms": latest,
        "last_modified": response.last_modified,
        "sha256": hashlib.sha256(response.body).hexdigest(),
        "last_valid_utc": last_valid.isoformat() if last_valid else None,
        "last_delivery_date": delivery_date(last_valid).isoformat() if last_valid else None,
    }


def poll(client: httpx.Client, out_dir: Path = AVAILABILITY_DIR) -> Path:
    now = utcnow()
    records = [poll_series(client, s, now) for s in POLLED]
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{now:%Y-%m}.jsonl"
    with path.open("a", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record, sort_keys=True) + "\n")
    return path


def first_seen_report(log_dir: Path = AVAILABILITY_DIR) -> pd.DataFrame:
    """For each series and delivery date, the first poll where that date was present.

    `seen_by_berlin` is an upper bound limited by polling frequency. A row only counts as observed
    if an earlier poll on record did not yet show the date, otherwise the arrival time is unknown.
    """
    frames = [pd.read_json(p, lines=True) for p in sorted(log_dir.glob("*.jsonl"))]
    if not frames:
        return pd.DataFrame()
    df = pd.concat(frames, ignore_index=True)
    df["polled_at_utc"] = pd.to_datetime(df["polled_at_utc"])
    df = df.sort_values("polled_at_utc")
    rows: list[dict[str, object]] = []
    for series_id, group in df.groupby("series_id"):
        previous: date | None = None
        for _, r in group.iterrows():
            if pd.isna(r["last_delivery_date"]):
                continue
            current = pd.Timestamp(r["last_delivery_date"]).date()
            if previous is not None and current > previous:
                seen = r["polled_at_utc"].tz_localize("UTC").tz_convert(BERLIN)
                rows.append(
                    {
                        "series_id": series_id,
                        "delivery_date": current.isoformat(),
                        "seen_by_berlin": seen.strftime("%Y-%m-%d %H:%M"),
                        "days_before_delivery": (current - seen.date()).days,
                        "last_modified": r["last_modified"],
                    }
                )
            previous = current if previous is None else max(previous, current)
    return pd.DataFrame(rows)
