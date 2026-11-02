import numpy as np
import pytest

from epf.models.metrics import block_bootstrap_mae_diff, coverage, mae, pinball, rmse, smape

Y = np.array([10.0, -20.0, 30.0, 0.0])
P = np.array([12.0, -10.0, 30.0, 0.0])


def test_mae():
    assert mae(Y, P) == pytest.approx(3.0)


def test_rmse():
    assert rmse(Y, P) == pytest.approx(np.sqrt((4 + 100) / 4))


def test_smape_handles_negative_and_double_zero():
    expected = 100 * np.mean([2 * 2 / 22, 2 * 10 / 30, 0, 0])
    assert smape(Y, P) == pytest.approx(expected)


def test_smape_upper_bound_on_opposite_signs():
    assert smape(np.array([1.0]), np.array([-1.0])) == pytest.approx(200.0)
    assert smape(np.array([1.0]), np.array([0.0])) == pytest.approx(200.0)


def test_coverage_includes_bounds():
    y = np.array([1.0, 2.0, 3.0, 4.0])
    assert coverage(y, np.full(4, 2.0), np.full(4, 3.0)) == pytest.approx(50.0)


def test_pinball_asymmetry():
    y, q = np.array([10.0]), np.array([0.0])
    assert pinball(y, q, 0.9) == pytest.approx(9.0)
    assert pinball(y, q, 0.1) == pytest.approx(1.0)
    assert pinball(q, y, 0.9) == pytest.approx(1.0)


@pytest.mark.parametrize("fn", [mae, rmse, smape])
def test_nan_and_length_rejected(fn):
    with pytest.raises(ValueError):
        fn(np.array([np.nan]), np.array([1.0]))
    with pytest.raises(ValueError):
        fn(np.array([1.0, 2.0]), np.array([1.0]))
    with pytest.raises(ValueError):
        fn(np.array([]), np.array([]))


def test_bootstrap_sign_and_interval():
    rng = np.random.default_rng(0)
    y = rng.normal(size=2400)
    good = y + rng.normal(scale=0.1, size=2400)
    bad = y + rng.normal(scale=2.0, size=2400)
    days = np.repeat(np.arange(100), 24)
    diff, low, high = block_bootstrap_mae_diff(y, good, bad, days, n=500)
    assert low <= diff <= high
    assert high < 0
