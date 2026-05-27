#!/usr/bin/env python3
"""
Extend monthly water-demand NetCDF time series with synthetic future scenarios
while preserving recent seasonality and applying a user-defined trend.

Requirements:
  - xarray
  - numpy
  - pandas
  - netCDF4 (recommended backend) or h5netcdf

Notes:
  - The script assumes the input has a monthly time axis (e.g., 1st of each month).
  - Spatial grid / resolution / coordinates are preserved.
  - New months are appended after the last timestamp (continuously).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, Optional, Sequence

import numpy as np
import pandas as pd
import xarray as xr


# =========================
# User parameters (edit me)
# =========================

# Input NetCDF file to extend
INPUT_NC = r"D:/DRBWBM/MODEL/Tisa_0814/input/landsurface/waterDemand/liv_month_mperday_1min_1960_2020.nc"

# Output NetCDF file path
OUTPUT_NC = r"D:/DRBWBM/MODEL/Tisa_0814/input/landsurface/waterDemand/SSP5.8.5/liv_month_mperday_1min_1960_2020_extended.nc"

# Trend definition:
#   - "linear"      : factor ramps linearly from 1.0 to (1 + pct/100) by TARGET_DATE
#   - "exponential" : factor ramps exponentially from 1.0 to (1 + pct/100) by TARGET_DATE
TREND_TYPE = "linear"  # "linear" or "exponential"

# Percent change that should be reached by TARGET_DATE relative to the LAST month in the input.
# Example: +20 means +20% by TARGET_DATE; -15 means -15% by TARGET_DATE.
PCT_CHANGE_BY_TARGET = 10.0

# The last point of the trend. This should be a future month start (YYYY-MM-01) or any date.
# The script will extend monthly up to and including the month containing this date.
TARGET_DATE = "2060-12-31"

# How many years back from the last input time to compute seasonality (monthly climatology).
# Example: 10 means use the last 10 years of data.
LOOKBACK_YEARS_FOR_SEASONALITY = 5

# Variables to extend (None = extend all data variables)
VARS_TO_EXTEND = None  # e.g., ["domWW", "domCon"]

# If negative trend drives values below 0, clip at 0.
CLIP_AT_ZERO = True


# =========================
# Implementation
# =========================

@dataclass
class Params:
    input_nc: str
    output_nc: str
    trend_type: str
    pct_change_by_target: float
    target_date: pd.Timestamp
    lookback_years: int
    vars_to_extend: Optional[Sequence[str]]
    clip_at_zero: bool


def _validate_params(p: Params) -> None:
    if not os.path.isfile(p.input_nc):
        raise FileNotFoundError(f"Input file not found: {p.input_nc}")

    tt = p.trend_type.lower().strip()
    if tt not in {"linear", "exponential"}:
        raise ValueError(f"TREND_TYPE must be 'linear' or 'exponential', got: {p.trend_type}")

    if p.lookback_years <= 0:
        raise ValueError("LOOKBACK_YEARS_FOR_SEASONALITY must be a positive integer.")

    # Ensure output folder exists
    out_dir = os.path.dirname(os.path.abspath(p.output_nc))
    if out_dir and not os.path.isdir(out_dir):
        os.makedirs(out_dir, exist_ok=True)


def _monthly_range_exclusive_start(start: pd.Timestamp, end: pd.Timestamp) -> pd.DatetimeIndex:
    """
    Create monthly timestamps strictly after `start` and up to `end` (inclusive),
    aligned to month starts.
    """
    start_ms = pd.Timestamp(start).to_period("M").to_timestamp(how="start")
    end_ms = pd.Timestamp(end).to_period("M").to_timestamp(how="start")

    if end_ms <= start_ms:
        return pd.DatetimeIndex([], dtype="datetime64[ns]")

    # Start from next month
    first = (start_ms + pd.offsets.MonthBegin(1)).to_period("M").to_timestamp(how="start")
    return pd.date_range(first, end_ms, freq="MS")


def _trend_factors(n_steps: int, trend_type: str, pct_change: float) -> np.ndarray:
    """
    Return an array of length n_steps with multiplicative factors for each future month.
    Factors start at ~1.0 for the first future month and reach (1+pct/100) at the last future month.
    """
    if n_steps <= 0:
        return np.array([], dtype=float)

    target_factor = 1.0 + (pct_change / 100.0)

    # Guard against nonsensical negative target for exponential (e.g., -150%)
    if trend_type == "exponential" and target_factor <= 0:
        raise ValueError(
            "For exponential trend, (1 + PCT_CHANGE_BY_TARGET/100) must be > 0. "
            f"Got target_factor={target_factor:.4g}."
        )

    # k goes from 1..n_steps (future months), normalized to [0..1] with endpoints.
    frac = np.linspace(1.0 / n_steps, 1.0, n_steps)

    if trend_type == "linear":
        factors = 1.0 + (target_factor - 1.0) * frac
    elif trend_type == "exponential":
        factors = target_factor ** frac
    else:
        raise ValueError("Unsupported trend_type.")

    return factors.astype(float)


def _compute_monthly_climatology(da: xr.DataArray, end_time: pd.Timestamp, lookback_years: int) -> xr.DataArray:
    """
    Compute per-cell monthly climatology using the last `lookback_years` years.
    Output dims: (month, lat, lon, ...) depending on input, but without time.
    """
    end_time = pd.Timestamp(end_time)

    # Lookback window starts at the beginning of the month `lookback_years` years before end_time.
    start_lb = (end_time.to_period("M").to_timestamp(how="start") - pd.DateOffset(years=lookback_years))

    recent = da.sel(time=slice(start_lb, end_time))
    if recent.sizes.get("time", 0) == 0:
        raise ValueError("Lookback window produced zero timesteps. Increase LOOKBACK_YEARS_FOR_SEASONALITY.")

    clim = recent.groupby("time.month").mean("time", skipna=True)
    return clim


def extend_dataset(ds: xr.Dataset, p: Params) -> xr.Dataset:
    if "time" not in ds.dims:
        raise ValueError("Input dataset has no 'time' dimension.")

    last_time = pd.Timestamp(ds["time"].values[-1]).to_pydatetime()
    last_time = pd.Timestamp(last_time)

    future_times = _monthly_range_exclusive_start(last_time, p.target_date)
    if len(future_times) == 0:
        # Nothing to extend
        return ds

    factors = _trend_factors(len(future_times), p.trend_type.lower().strip(), p.pct_change_by_target)
    factors_da = xr.DataArray(factors, coords={"time": future_times}, dims=("time",))

    # Decide which variables to extend
    vars_to_extend = list(ds.data_vars) if p.vars_to_extend is None else list(p.vars_to_extend)

    out_vars: Dict[str, xr.DataArray] = {}
    for vname in ds.data_vars:
        da = ds[vname]

        if vname not in vars_to_extend:
            out_vars[vname] = da
            continue

        if "time" not in da.dims:
            # Non-time variables are copied as-is
            out_vars[vname] = da
            continue

        # Compute monthly climatology from recent years
        clim = _compute_monthly_climatology(da, last_time, p.lookback_years)

        # Build future values by selecting climatology for each future month
        months = xr.DataArray(future_times.month, coords={"time": future_times}, dims=("time",))
        future = clim.sel(month=months).drop_vars("month")

        # Apply trend factor (broadcast over spatial dims)
        future = future * factors_da

        if p.clip_at_zero:
            future = xr.where(future < 0, 0, future)

        # Preserve dtype (commonly float32)
        if np.issubdtype(da.dtype, np.floating):
            future = future.astype(da.dtype)

        # Concatenate along time
        out_vars[vname] = xr.concat([da, future], dim="time")

        # Preserve variable attributes
        out_vars[vname].attrs = da.attrs.copy()

    # Build output dataset while preserving coordinates and attributes
    combined_time = xr.concat([ds["time"], xr.DataArray(future_times, dims="time")], dim="time")

    # Start from original coords to preserve order and metadata
    out = xr.Dataset(out_vars, coords={k: ds.coords[k] for k in ds.coords if k != 'time'})
    out = out.assign_coords(time=combined_time)
    out.attrs = ds.attrs.copy()

    # Preserve coord attributes
    for cname in ds.coords:
        out[cname].attrs = ds[cname].attrs.copy()

    return out


def main() -> None:
    p = Params(
        input_nc=INPUT_NC,
        output_nc=OUTPUT_NC,
        trend_type=TREND_TYPE,
        pct_change_by_target=PCT_CHANGE_BY_TARGET,
        target_date=pd.Timestamp(TARGET_DATE),
        lookback_years=int(LOOKBACK_YEARS_FOR_SEASONALITY),
        vars_to_extend=VARS_TO_EXTEND,
        clip_at_zero=bool(CLIP_AT_ZERO),
    )
    _validate_params(p)

    # Open lazily to avoid loading the full cube into memory.
    ds = xr.open_dataset(p.input_nc, decode_times=True)

    out = extend_dataset(ds, p)

    # Try to preserve original encodings (chunking/compression) if present.
    # Allowed netCDF4 encoding keys
    ALLOWED_ENCODING_KEYS = {
        "dtype", "zlib", "complevel", "shuffle", "fletcher32",
        "contiguous", "chunksizes", "_FillValue",
        "endian", "significant_digits", "least_significant_digit"
    }

    encoding = {}

    for v in out.data_vars:
        enc = {}
        for k, val in ds[v].encoding.items():
            if k in ALLOWED_ENCODING_KEYS:
                enc[k] = val
        encoding[v] = enc

    # Write output
    out.to_netcdf(p.output_nc, format="NETCDF4", encoding=encoding)
    print(f"Saved extended dataset: {p.output_nc}")
    print(f"Original last time: {pd.Timestamp(ds['time'].values[-1]).date()}")
    print(f"New last time:      {pd.Timestamp(out['time'].values[-1]).date()}")
    print(f"Added months:       {len(out['time']) - len(ds['time'])}")


if __name__ == "__main__":
    main()
