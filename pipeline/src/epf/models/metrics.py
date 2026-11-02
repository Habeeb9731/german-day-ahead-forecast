"""Forecast metrics. All take aligned arrays in EUR/MWh, and ignore nothing silently."""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

Array = npt.NDArray[np.float64]


def _check(y: Array, yhat: Array) -> None:
    if len(y) != len(yhat):
        raise ValueError("arrays differ in length")
    if len(y) == 0:
        raise ValueError("no observations")
    if np.isnan(y).any() or np.isnan(yhat).any():
        raise ValueError("NaN in inputs")


def mae(y: Array, yhat: Array) -> float:
    _check(y, yhat)
    return float(np.mean(np.abs(y - yhat)))


def rmse(y: Array, yhat: Array) -> float:
    _check(y, yhat)
    return float(np.sqrt(np.mean((y - yhat) ** 2)))


def smape(y: Array, yhat: Array) -> float:
    """Symmetric MAPE in percent, range 0-200. Absolute values in the denominator keep it defined
    for negative prices, but it is unstable near zero, so read it alongside MAE. A pair where both
    values are exactly zero counts as no error."""
    _check(y, yhat)
    denom = np.abs(y) + np.abs(yhat)
    terms = np.divide(2 * np.abs(y - yhat), denom, out=np.zeros_like(y), where=denom != 0)
    return float(100 * np.mean(terms))


def coverage(y: Array, lower: Array, upper: Array) -> float:
    """Share of actuals inside [lower, upper], in percent. Target for P10-P90 is 80."""
    _check(y, lower)
    _check(y, upper)
    return float(100 * np.mean((y >= lower) & (y <= upper)))


def pinball(y: Array, q: Array, alpha: float) -> float:
    """Quantile loss at level alpha."""
    _check(y, q)
    diff = y - q
    return float(np.mean(np.maximum(alpha * diff, (alpha - 1) * diff)))


def block_bootstrap_mae_diff(
    y: Array,
    a: Array,
    b: Array,
    days: npt.NDArray[np.int64],
    n: int = 2000,
    seed: int = 42,
) -> tuple[float, float, float]:
    """MAE(a) - MAE(b) with a 95% interval, resampling whole days so that hours within a day are
    not treated as independent. A negative value means `a` beat `b`."""
    _check(y, a)
    _check(y, b)
    delta = np.abs(y - a) - np.abs(y - b)
    unique, inverse = np.unique(days, return_inverse=True)
    totals = np.bincount(inverse, weights=delta)
    counts = np.bincount(inverse)
    rng = np.random.default_rng(seed)
    picks = rng.integers(0, len(unique), size=(n, len(unique)))
    samples = totals[picks].sum(axis=1) / counts[picks].sum(axis=1)
    low, high = np.percentile(samples, [2.5, 97.5])
    return float(delta.mean()), float(low), float(high)
