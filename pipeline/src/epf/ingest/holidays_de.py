"""German public holidays from the offline `holidays` package.

`state_share` is the fraction of the 16 states observing a date. It is a plain count and is not
weighted by population or demand.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from datetime import date

import duckdb
import holidays as hol

STATES = (
    "BB", "BE", "BW", "BY", "HB", "HE", "HH", "MV", "NI", "NW", "RP", "SH", "SL", "SN", "ST", "TH",
)  # fmt: skip


def build(years: Iterable[int]) -> list[tuple[date, str, bool, float]]:
    years = list(years)
    national = hol.country_holidays("DE", years=years)
    counts: dict[date, int] = defaultdict(int)
    names: dict[date, str] = {}
    for state in STATES:
        for day, name in hol.country_holidays("DE", subdiv=state, years=years).items():
            counts[day] += 1
            names.setdefault(day, name)
    return sorted((day, names[day], day in national, counts[day] / len(STATES)) for day in counts)


def ingest(con: duckdb.DuckDBPyConnection, years: Iterable[int]) -> int:
    rows = build(years)
    con.execute("BEGIN")
    con.execute("DELETE FROM holiday")
    con.executemany("INSERT INTO holiday VALUES (?, ?, ?, ?)", rows)
    con.execute("COMMIT")
    return len(rows)
