"""Shared helpers. All market values in tests are SYNTHETIC SAMPLE DATA, not real prices."""

from __future__ import annotations

import json
from datetime import datetime

import duckdb
import pytest

from epf.db import connect
from epf.timeutil import utc_to_ms


@pytest.fixture
def con(tmp_path) -> duckdb.DuckDBPyConnection:
    return connect(tmp_path / "test.duckdb")


def chunk_body(points: list[tuple[datetime, float | None]]) -> bytes:
    """A SMARD-shaped chunk containing synthetic values."""
    return json.dumps(
        {"meta_data": {"version": 1}, "series": [[utc_to_ms(t), v] for t, v in points]}
    ).encode()
