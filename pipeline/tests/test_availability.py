import json

from epf.ingest.availability import first_seen_report


def _write(tmp_path, rows):
    path = tmp_path / "2026-11.jsonl"
    path.write_text("\n".join(json.dumps(r) for r in rows) + "\n")


def _row(polled, delivery, lm="x", series="load_forecast"):
    return {
        "polled_at_utc": polled,
        "series_id": series,
        "last_delivery_date": delivery,
        "last_modified": lm,
    }


def test_arrival_is_only_reported_when_transition_was_observed(tmp_path):
    _write(
        tmp_path,
        [
            _row("2026-11-03T08:00:00", "2026-11-03"),  # already there: arrival unknown
            _row("2026-11-03T08:30:00", "2026-11-03"),
            _row("2026-11-03T09:02:00", "2026-11-04"),
        ],
    )
    report = first_seen_report(tmp_path)
    assert len(report) == 1
    row = report.iloc[0]
    assert row["delivery_date"] == "2026-11-04"
    assert row["seen_by_berlin"] == "2026-11-03 10:02"
    assert row["days_before_delivery"] == 1


def test_empty_log(tmp_path):
    assert first_seen_report(tmp_path).empty
