# src/hydro_eval/core/hydrology.py
from __future__ import annotations

from typing import Dict, List

import numpy as np
import pandas as pd

from hydro_eval.core.stats import drop_feb29


def q_threshold(df: pd.DataFrame, station: str, quantile: float) -> float:
    """
    Compute a discharge quantile threshold for a station.

    Parameters
    ----------
    df : pd.DataFrame
        Daily discharge dataframe.
    station : str
        Station column name.
    quantile : float
        Quantile in [0, 1], e.g. 0.05 or 0.95.

    Returns
    -------
    float
        Threshold value.
    """
    x = pd.to_numeric(df[station], errors="coerce").dropna().to_numpy()
    if x.size == 0:
        return float("nan")
    return float(np.quantile(x, quantile))


def annual_count_below_threshold(
    df: pd.DataFrame, station: str, threshold: float
) -> pd.DataFrame:
    """
    Compute annual count of days below a threshold.

    Parameters
    ----------
    df : pd.DataFrame
        Daily discharge dataframe.
    station : str
        Station column.
    threshold : float
        Threshold value.

    Returns
    -------
    pd.DataFrame
        Columns:
        - year
        - count
    """
    if df.empty or np.isnan(threshold):
        return pd.DataFrame(columns=["year", "count"])

    x = df[["date", station]].copy()
    x[station] = pd.to_numeric(x[station], errors="coerce")
    x = x.dropna(subset=[station])

    if x.empty:
        return pd.DataFrame(columns=["year", "count"])

    x["year"] = x["date"].dt.year
    x["flag"] = x[station] < threshold

    out = x.groupby("year", as_index=False)["flag"].sum()
    out["count"] = out["flag"].astype(int)
    return out[["year", "count"]].sort_values("year").reset_index(drop=True)  # type: ignore


def annual_count_above_threshold(
    df: pd.DataFrame, station: str, threshold: float
) -> pd.DataFrame:
    """
    Compute annual count of days above a threshold.

    Parameters
    ----------
    df : pd.DataFrame
        Daily discharge dataframe.
    station : str
        Station column.
    threshold : float
        Threshold value.

    Returns
    -------
    pd.DataFrame
        Columns:
        - year
        - count
    """
    if df.empty or np.isnan(threshold):
        return pd.DataFrame(columns=["year", "count"])

    x = df[["date", station]].copy()
    x[station] = pd.to_numeric(x[station], errors="coerce")
    x = x.dropna(subset=[station])

    if x.empty:
        return pd.DataFrame(columns=["year", "count"])

    x["year"] = x["date"].dt.year
    x["flag"] = x[station] > threshold

    out = x.groupby("year", as_index=False)["flag"].sum()
    out["count"] = out["flag"].astype(int)
    return out[["year", "count"]].sort_values("year").reset_index(drop=True)  # type: ignore


def spell_lengths(mask: np.ndarray, min_event_days: int = 1) -> List[int]:
    """
    Extract lengths of consecutive True runs filtered by minimum duration.

    Parameters
    ----------
    mask : np.ndarray
        Boolean array where True marks an event day.
    min_event_days : int, default 1
        Minimum spell duration to be retained.

    Returns
    -------
    list[int]
        Lengths of valid spells.
    """
    lengths: List[int] = []
    run = 0

    for flag in mask:
        if flag:
            run += 1
        elif run > 0:
            if run >= min_event_days:
                lengths.append(run)
            run = 0

    if run > 0 and run >= min_event_days:
        lengths.append(run)

    return lengths


def annual_spell_metrics(
    df: pd.DataFrame,
    station: str,
    threshold: float,
    min_event_days: int,
) -> pd.DataFrame:
    """
    Compute annual spell statistics for one station.

    Parameters
    ----------
    df : pd.DataFrame
        Daily discharge dataframe.
    station : str
        Station column name.
    threshold : float
        Threshold derived from reference baseline.
    min_event_days : int
        Minimum spell duration to be counted.

    Returns
    -------
    pd.DataFrame
        Annual metrics with columns:
        - year
        - n_periods
        - mean_period_len_days
        - max_period_len_days
    """
    if df.empty or np.isnan(threshold):
        return pd.DataFrame(
            columns=["year", "n_periods", "mean_period_len_days", "max_period_len_days"]
        )

    x = df[["date", station]].copy()
    x[station] = pd.to_numeric(x[station], errors="coerce")
    x = x.dropna(subset=[station])

    if x.empty:
        return pd.DataFrame(
            columns=["year", "n_periods", "mean_period_len_days", "max_period_len_days"]
        )

    x["year"] = x["date"].dt.year
    rows: List[Dict[str, float | int]] = []

    for year, grp in x.groupby("year"):
        mask = grp[station].to_numpy(dtype=float) < threshold
        lengths = spell_lengths(mask, min_event_days=min_event_days)

        if lengths:
            n_periods = int(len(lengths))
            mean_len = float(np.mean(lengths))
            max_len = float(np.max(lengths))
        else:
            n_periods = 0
            mean_len = float("nan")
            max_len = float("nan")

        rows.append(
            {
                "year": int(year),  # type: ignore
                "n_periods": n_periods,
                "mean_period_len_days": mean_len,
                "max_period_len_days": max_len,
            }
        )

    return pd.DataFrame(rows).sort_values("year").reset_index(drop=True)


def annual_deficit_below_threshold(
    df: pd.DataFrame, station: str, threshold: float
) -> pd.DataFrame:
    """
    Compute annual deficit metrics below a threshold.

    Parameters
    ----------
    df : pd.DataFrame
        Daily discharge dataframe.
    station : str
        Station column name.
    threshold : float
        Threshold derived from reference baseline.

    Returns
    -------
    pd.DataFrame
        Annual metrics with columns:
        - year
        - n_days
        - deficit_m3
        - deficit_rel_q_pct
    """
    if df.empty or np.isnan(threshold) or threshold == 0:
        return pd.DataFrame(
            columns=["year", "n_days", "deficit_m3", "deficit_rel_q_pct"]
        )

    x = df[["date", station]].copy()
    x[station] = pd.to_numeric(x[station], errors="coerce")
    x = x.dropna(subset=[station])

    if x.empty:
        return pd.DataFrame(
            columns=["year", "n_days", "deficit_m3", "deficit_rel_q_pct"]
        )

    q = x[station].to_numpy(dtype=float)

    deficit_cms = np.where(q < threshold, threshold - q, 0.0)
    deficit_m3 = deficit_cms * 86400.0
    deficit_rel = np.where(q < threshold, (threshold - q) / threshold, 0.0)

    x["year"] = x["date"].dt.year
    x["deficit_m3"] = deficit_m3
    x["deficit_rel"] = deficit_rel

    out = (
        x.groupby("year", as_index=False)
        .agg(
            n_days=("date", "size"),
            deficit_m3=("deficit_m3", "sum"),
            deficit_rel_sum=("deficit_rel", "sum"),
        )
        .sort_values("year")
        .reset_index(drop=True)
    )

    out["deficit_rel_q_pct"] = (out["deficit_rel_sum"] / out["n_days"]) * 100.0
    return out.drop(columns="deficit_rel_sum")


def annual_max(df: pd.DataFrame, station: str) -> pd.DataFrame:
    """
    Compute annual maximum discharge for one station.

    Parameters
    ----------
    df : pd.DataFrame
        Daily discharge dataframe.
    station : str
        Station column name.

    Returns
    -------
    pd.DataFrame
        Annual maxima with columns:
        - year
        - amax
    """
    if df.empty:
        return pd.DataFrame(columns=["year", "amax"])

    x = df[["date", station]].copy()
    x[station] = pd.to_numeric(x[station], errors="coerce")
    x = x.dropna(subset=[station])

    if x.empty:
        return pd.DataFrame(columns=["year", "amax"])

    x["year"] = x["date"].dt.year
    out = x.groupby("year", as_index=False)[station].max()
    out = out.rename(columns={station: "amax"})  # type: ignore
    return out.sort_values("year").reset_index(drop=True)


def daily_regime(df: pd.DataFrame, station: str) -> pd.DataFrame:
    """
    Compute a 365-day climatological flow regime for one station.

    Parameters
    ----------
    df : pd.DataFrame
        Daily discharge dataframe.
    station : str
        Station column name.

    Returns
    -------
    pd.DataFrame
        Daily regime with columns:
        - doy
        - month
        - day
        - mean
        - p05
        - p25
        - p75
        - p95
    """
    if df.empty:
        return pd.DataFrame(
            columns=["doy", "month", "day", "mean", "p05", "p25", "p75", "p95"]
        )

    x = df[["date", station]].copy()
    x[station] = pd.to_numeric(x[station], errors="coerce")
    x = x.dropna(subset=[station])
    x = drop_feb29(x)

    if x.empty:
        return pd.DataFrame(
            columns=["doy", "month", "day", "mean", "p05", "p25", "p75", "p95"]
        )

    x["month"] = x["date"].dt.month
    x["day"] = x["date"].dt.day

    rows: List[dict] = []
    for (month, day), grp in x.groupby(["month", "day"], sort=True):
        vals = grp[station].to_numpy(dtype=float)
        rows.append(
            {
                "month": int(month),  # type: ignore
                "day": int(day),  # type: ignore
                "mean": float(np.mean(vals)),
                "p05": float(np.percentile(vals, 5)),
                "p25": float(np.percentile(vals, 25)),
                "p75": float(np.percentile(vals, 75)),
                "p95": float(np.percentile(vals, 95)),
            }
        )

    out = pd.DataFrame(rows).sort_values(["month", "day"]).reset_index(drop=True)
    out["doy"] = np.arange(1, len(out) + 1)
    return out[["doy", "month", "day", "mean", "p05", "p25", "p75", "p95"]]
