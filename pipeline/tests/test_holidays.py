from datetime import date

from epf.ingest import holidays_de


def _by_date():
    return {r[0]: r for r in holidays_de.build([2026])}


def test_national_holiday_covers_all_states():
    row = _by_date()[date(2026, 12, 25)]
    assert row[2] is True
    assert row[3] == 1.0


def test_regional_holiday_has_partial_share():
    # Epiphany is observed in BW, BY and ST only.
    row = _by_date()[date(2026, 1, 6)]
    assert row[2] is False
    assert row[3] == 3 / 16


def test_ingest_replaces_rows(con):
    first = holidays_de.ingest(con, [2026])
    assert holidays_de.ingest(con, [2026]) == first
    assert con.execute("SELECT count(*) FROM holiday").fetchone()[0] == first
