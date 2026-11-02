"""Conformal calibration. All values are SYNTHETIC SAMPLE DATA."""

from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from epf.models import calibrate

rng = np.random.default_rng(5)


def _frame(n=2400, noise=20.0):
    y = rng.normal(50, noise, n)
    hours = np.tile(np.arange(24), n // 24)
    holdout = pd.DataFrame({"y": y, "hour": hours})
    # Deliberately overconfident: the range is much narrower than the noise.
    predicted = pd.DataFrame(
        {"p10": np.full(n, 45.0), "p50": np.full(n, 50.0), "p90": np.full(n, 55.0)}
    )
    return holdout, predicted


def _coverage(y, band):
    return np.mean((y >= band["p10"]) & (y <= band["p90"]))


def test_narrow_range_is_widened_to_about_target():
    holdout, predicted = _frame()
    adjustments = calibrate.fit(holdout, predicted)
    assert _coverage(holdout["y"], predicted) < 0.3
    fresh, fresh_predicted = _frame()
    band = calibrate.apply(fresh_predicted, fresh["hour"], adjustments)
    assert 0.72 < _coverage(fresh["y"], band) < 0.88


def test_too_wide_range_is_narrowed():
    holdout, _ = _frame(noise=2.0)
    wide = pd.DataFrame(
        {
            "p10": np.full(len(holdout), 0.0),
            "p50": np.full(len(holdout), 50.0),
            "p90": np.full(len(holdout), 100.0),
        }
    )
    band = calibrate.apply(wide, holdout["hour"], calibrate.fit(holdout, wide))
    assert (band["p90"] - band["p10"]).mean() < 100


def test_p50_is_unchanged_and_order_is_kept():
    holdout, predicted = _frame()
    band = calibrate.apply(predicted, holdout["hour"], {"all": -50.0})
    pd.testing.assert_series_equal(band["p50"], predicted["p50"])
    assert (band["p10"] <= band["p50"]).all()
    assert (band["p50"] <= band["p90"]).all()


def test_hours_get_their_own_adjustment():
    holdout = pd.DataFrame({"y": [10.0] * 20 + [100.0] * 20, "hour": [0] * 20 + [1] * 20})
    predicted = pd.DataFrame({"p10": [10.0] * 40, "p50": [10.0] * 40, "p90": [10.0] * 40})
    fitted = calibrate.fit(holdout, predicted)
    assert fitted["0"] == 0
    assert fitted["1"] == 90


def test_unseen_hour_uses_overall_value():
    predicted = pd.DataFrame({"p10": [10.0], "p50": [10.0], "p90": [10.0]})
    band = calibrate.apply(predicted, pd.Series([2]), {"0": 1.0, "all": 5.0})
    assert band["p90"].iloc[0] == 15.0


def test_holdout_uses_only_earlier_days():
    start = date(2026, 1, 1)
    data = pd.DataFrame({"delivery_date": [start + timedelta(days=i) for i in range(200)]})
    before = date(2026, 6, 1)
    fit_rows, holdout = calibrate.holdout_split(data, before)
    assert holdout["delivery_date"].max() < before
    assert fit_rows["delivery_date"].max() < holdout["delivery_date"].min()
    assert len(holdout) == calibrate.HOLDOUT_DAYS


def test_empty_holdout_is_rejected():
    with pytest.raises(ValueError):
        calibrate.fit(pd.DataFrame({"y": [], "hour": []}), pd.DataFrame({"p10": [], "p90": []}))
