# src/hydro_eval/core/timewindow.py
from __future__ import annotations

import logging
from dataclasses import dataclass
import pandas as pd

logger = logging.getLogger(__name__)

@dataclass(frozen=True)
class TimeWindow:
    name: str
    start: pd.Timestamp
    end: pd.Timestamp


def to_timewindow(name: str, start: str, end: str) -> TimeWindow:
    """Parse time window definition from config and create TimeWindow from ISO strings."""
    return TimeWindow(
        name=name,
        start=pd.to_datetime(start),
        end=pd.to_datetime(end),
    )

def slice_window(df: pd.DataFrame, window: TimeWindow) -> pd.DataFrame:
    """Slice a dataframe by inclusive date window.

    Assumes df has column 'date' of datetime64 type.
    """
    if "date" not in df.columns:
        raise ValueError("DataFrame must contain 'date' column.")
    
    if not pd.api.types.is_datetime64_any_dtype(df["date"]):
        raise ValueError("'date' column must be datetime64 dtype.")
    
    mask = (df["date"] >= window.start) & (df["date"] <= window.end)
    out = df.loc[mask].copy()

    logger.debug(
        f"Sliced window {window.name}: {window.start.date()} -> {window.end.date()} | keeping {len(out)}/{len(df)} rows."
    )
    return out

def slice_between(df: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    """Return df sliced between start and end (inclusive)."""
    if df.empty:
        return df
    mask = (df["date"] >= start) & (df["date"] <= end)
    return df.loc[mask].copy()
