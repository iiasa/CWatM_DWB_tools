# src/hydro_eval/core/stats.py
from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np
import pandas as pd


def station_columns(df: pd.DataFrame) -> List[str]:
    """
    Return station columns from an input dataframe.

    Parameters
    ----------
    df : pd.DataFrame
        Input dataframe with a required `date` column.

    Returns
    -------
    list[str]
        All non-date columns.
    """
    return [col for col in df.columns if col != "date"]


def percentiles(values: np.ndarray, ps: np.ndarray) -> Dict[str, float]:
    """
    Compute selected percentiles for an input array.

    Parameters
    ----------
    values : np.ndarray
        Input values.
    ps : np.ndarray
        Percentiles to compute.

    Returns
    -------
    dict[str, float]
        Percentile values as p0, p5, ...
    """
    if values.size == 0:
        return {f"p{int(p)}": float("nan") for p in ps}

    out = np.percentile(values, ps)
    return {f"p{int(p)}": float(v) for p, v in zip(ps, out)}


def fdc_empirical(values: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """
    Build an empirical exceedance curve from annual values.

    Uses Weibull plotting position.

    Parameters
    ----------
    values : np.ndarray
        Input values.

    Returns
    -------
    tuple[np.ndarray, np.ndarray]
        Exceedance probability and sorted values.
    """
    x = values[~np.isnan(values)]
    if x.size == 0:
        return np.array([], dtype=float), np.array([], dtype=float)

    y = np.sort(x)
    n = y.size
    ranks = np.arange(1, n + 1, dtype=float)
    p_nonexceed = ranks / (n + 1.0)
    p_exceed = 100.0 * (1.0 - p_nonexceed)
    return p_exceed, y


def drop_feb29(df: pd.DataFrame) -> pd.DataFrame:
    """
    Remove 29 February to keep a 365-day climatological year.

    Parameters
    ----------
    df : pd.DataFrame
        Input dataframe with a `date` column.

    Returns
    -------
    pd.DataFrame
        Dataframe without leap-day rows.
    """
    if df.empty:
        return df
    mask = ~((df["date"].dt.month == 2) & (df["date"].dt.day == 29))
    return df.loc[mask].copy()
