# src/hydro_eval/io/reader.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GridMeta:
    """Metadata about the loaded time series table/station."""

    file: Path
    cols: list[str]  # station columns (excluding 'date')


def _detect_date_column(columns: list[str], preferred: str = "Date") -> str:
    """Detect date column name from a list of candidates."""
    if preferred in columns:
        return preferred

    candidates = [
        "date",
        "Date",
        "DATE",
        "time",
        "Time",
        "TIME",
        "datetime",
        "Datetime",
        "timestamp",
        "Timestamp",
    ]
    for c in candidates:
        if c in columns:
            return c

    # Fallback: case-insensitive match for 'date'
    lower_map = {c.lower(): c for c in columns}
    if "date" in lower_map:
        return lower_map["date"]

    raise ValueError(
        f"Missing a date column. Tried candidates: {candidates}. "
        f"Available columns: {columns[:20]}{'...' if len(columns) > 20 else ''}"
    )


def read_variable_csv(
    file_path: Path,
    stations: list[str] | None = None,
    date_col: str = "Date",
) -> tuple[pd.DataFrame, GridMeta]:
    """Read a CWatM-style CSV with a date column and station columns.

    Expected format (after a typical 4 rows of metadata that we skip):
        date,<station_1>,<station_2>,...

    Args:
        file_path: Path to CSV file.
        stations: If provided, load only these station columns (plus date).
        date_col: Name of the date column (default: 'date').

    Returns:
        (df, meta) where df contains 'date' + station columns.

    Raises:
        FileNotFoundError: If file does not exist.
        ValueError: If requested stations are missing or date column is missing.
    """
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"Variable file not found: {file_path}")

    # Read only header to validate columns without loading full file
    header = pd.read_csv(
        file_path, nrows=0, skiprows=3, skipinitialspace=True
    )  # skip metadata rows
    columns = list(header.columns)

    # autodetect (handles Date vs date)
    actual_date_col = _detect_date_column(columns, preferred=date_col)
    all_stations = [c for c in columns if c != actual_date_col]

    if stations is not None:
        missing = [station for station in stations if station not in columns]
        if missing:
            raise ValueError(
                f"Requested stations not found in file {file_path}: {missing}\nAvailable stations: {all_stations[:20]}{'...' if len(all_stations) > 20 else ''}"
            )
        usecols = [actual_date_col] + stations
    else:
        usecols = [actual_date_col] + all_stations  # load all
    # Raead the actial data with efficient column selection
    df = pd.read_csv(
        file_path,
        usecols=usecols,
        parse_dates=[actual_date_col],
        skipinitialspace=True,
        skiprows=3,  # skip metadata rows
    )
    df.columns = df.columns.str.strip()  # trim whitespace from column names

    # Normalise: ensure date colun is named exactly 'date' in the returned DataFrame
    if actual_date_col != "date":
        df.rename(columns={actual_date_col: "date"}, inplace=True)
    # Ensure datetime dtype for date column
    df["date"] = pd.to_datetime(df["date"], errors="coerce", dayfirst=True)
    # Ensure ascending by date (CWatM file should already be sorted, but just in case)
    df = df.sort_values("date").reset_index(drop=True)

    meta = GridMeta(
        file=file_path.resolve(), cols=[col for col in df.columns if col != "date"]
    )

    logger.debug(
        f"Loaded CSV | {file_path} | shape={df.shape} | cols={meta.cols[: min(10, len(meta.cols))]} {'...' if len(meta.cols) > 10 else ''}"
    )

    return df, meta
