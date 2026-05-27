#!/usr/bin/env python3
"""
netcdf_to_timeseries_csv_ini_area.py

NetCDF -> CSV time series extractor using an INI config file.

Key addition:
- agg_order for aggregated outputs:
    * space_then_time: spatial aggregate on daily data, then time aggregate the 1D series
    * time_then_space: time aggregate on grid first, then spatial aggregate (default in many workflows)

This matters when spatial validity changes over time (missing/invalid cells vary by day).

Usage:
  python netcdf_to_timeseries_csv_ini_area.py --config config.ini
"""

from __future__ import annotations

import argparse
import configparser
import sys
from pathlib import Path
from typing import Optional, Tuple, List

import numpy as np
import pandas as pd
import xarray as xr


# ----------------------------
# INI helpers
# ----------------------------
def read_ini(path: str) -> configparser.ConfigParser:
    cfg = configparser.ConfigParser()
    cfg.read(path, encoding="utf-8")
    return cfg


def get_str(cfg: configparser.ConfigParser, section: str, key: str, default: Optional[str] = None) -> Optional[str]:
    if not cfg.has_option(section, key):
        return default
    val = cfg.get(section, key).strip()
    return val if val != "" else default


def get_bool(cfg: configparser.ConfigParser, section: str, key: str, default: bool = False) -> bool:
    if not cfg.has_option(section, key):
        return default
    return cfg.getboolean(section, key)


def get_float(cfg: configparser.ConfigParser, section: str, key: str, default: Optional[float] = None) -> Optional[float]:
    s = get_str(cfg, section, key, None)
    if s is None:
        return default
    return float(s)


def parse_csv_floats(s: Optional[str]) -> Optional[List[float]]:
    if s is None:
        return None
    s = s.strip()
    if not s:
        return None
    return [float(x.strip()) for x in s.split(",") if x.strip()]


def parse_csv_strs(s: Optional[str]) -> Optional[List[str]]:
    if s is None:
        return None
    s = s.strip()
    if not s:
        return None
    return [x.strip() for x in s.split(",") if x.strip()]


def parse_bbox(s: Optional[str]) -> Optional[Tuple[float, float, float, float]]:
    vals = parse_csv_floats(s)
    if vals is None:
        return None
    if len(vals) != 4:
        raise ValueError("bbox must be 'latmin,latmax,lonmin,lonmax'")
    latmin, latmax, lonmin, lonmax = vals
    if latmin > latmax:
        latmin, latmax = latmax, latmin
    if lonmin > lonmax:
        lonmin, lonmax = lonmax, lonmin
    return latmin, latmax, lonmin, lonmax


def normalize_date_str(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    s = s.strip()
    if not s:
        return None
    if "." in s and len(s) >= 10:
        return s.replace(".", "-")
    return s


def ensure_csv_extension(path: Path) -> Path:
    if path.suffix.lower() != ".csv":
        return path.with_suffix(".csv")
    return path


# ----------------------------
# NetCDF helpers
# ----------------------------
def ensure_time_index(ds: xr.Dataset, time_dim: str = "time") -> xr.Dataset:
    if time_dim not in ds.coords and time_dim not in ds.dims:
        raise ValueError(f"No '{time_dim}' coordinate/dimension found.")
    try:
        _ = pd.DatetimeIndex(ds[time_dim].to_index())
    except Exception as e:
        raise ValueError("Time coordinate is not decodable to datetime.") from e
    return ds


def detect_lat_lon(da: xr.DataArray) -> Tuple[str, str]:
    names = set(list(da.coords) + list(da.dims))
    for lat_name, lon_name in [("lat", "lon"), ("latitude", "longitude"), ("Lat", "Lon")]:
        if lat_name in names and lon_name in names:
            return lat_name, lon_name
    raise ValueError(
        f"Could not detect lat/lon in coords/dims. Found: {sorted(names)}. "
        "If your data uses y/x or 2D lat/lon, this script needs adaptation."
    )


def sort_lat_if_needed(da: xr.DataArray, lat_name: str) -> xr.DataArray:
    lat = da[lat_name].values
    if lat.ndim == 1 and len(lat) > 1 and lat[0] > lat[-1]:
        return da.sortby(lat_name)
    return da


def apply_time_slice(da: xr.DataArray, start: Optional[str], end: Optional[str]) -> xr.DataArray:
    if start is None and end is None:
        return da
    return da.sel(time=slice(start, end))


def bbox_mask(da: xr.DataArray, lat_name: str, lon_name: str, bbox: Tuple[float, float, float, float]) -> xr.DataArray:
    latmin, latmax, lonmin, lonmax = bbox
    lat = da[lat_name]
    lon = da[lon_name]
    m_lat = (lat >= latmin) & (lat <= latmax)
    m_lon = (lon >= lonmin) & (lon <= lonmax)
    return (m_lat * 1).astype(bool) & (m_lon * 1).astype(bool)


def load_mask(
    mask_path: str,
    mask_var: str,
    target_da: xr.DataArray,
    lat_name: str,
    lon_name: str,
    mask_threshold: Optional[float],
    mask_equals: Optional[float],
) -> xr.DataArray:
    mds = xr.open_dataset(mask_path)
    if mask_var not in mds:
        raise ValueError(f"Mask variable '{mask_var}' not found. Available: {list(mds.data_vars)}")
    m = mds[mask_var]

    rename_map = {}
    if lat_name not in m.coords and lat_name not in m.dims:
        for alt in ("lat", "latitude", "Lat"):
            if alt in m.coords or alt in m.dims:
                rename_map[alt] = lat_name
                break
    if lon_name not in m.coords and lon_name not in m.dims:
        for alt in ("lon", "longitude", "Lon"):
            if alt in m.coords or alt in m.dims:
                rename_map[alt] = lon_name
                break
    if rename_map:
        m = m.rename(rename_map)

    if lat_name in m.coords:
        m = m.reindex({lat_name: target_da[lat_name]}, method="nearest")
    if lon_name in m.coords:
        m = m.reindex({lon_name: target_da[lon_name]}, method="nearest")

    if mask_equals is not None:
        inside = (m == mask_equals)
    else:
        thr = 0.5 if mask_threshold is None else mask_threshold
        inside = (m >= thr)

    return inside.astype(bool)


# ----------------------------
# Aggregations
# ----------------------------
def aggregate_series_time(s: pd.Series, out_freq: str, time_agg: str) -> pd.Series:
    """Aggregate a 1D pandas time series to monthly/yearly."""
    out_freq = out_freq.lower()
    time_agg = time_agg.lower()

    if out_freq == "daily":
        return s

    if out_freq == "monthly":
        key = s.index.to_period("M")
        if time_agg == "sum":
            out = s.groupby(key).sum()
        elif time_agg == "mean":
            out = s.groupby(key).mean()
        else:
            raise ValueError("time_agg must be mean|sum")
        out.index = out.index.to_timestamp(how="start")
        return out

    if out_freq == "yearly":
        key = s.index.year
        if time_agg == "sum":
            out = s.groupby(key).sum()
        elif time_agg == "mean":
            out = s.groupby(key).mean()
        else:
            raise ValueError("time_agg must be mean|sum")
        out.index = pd.to_datetime([f"{int(y)}-01-01" for y in out.index])
        return out

    raise ValueError("out_freq must be daily|monthly|yearly")


def time_aggregate_grid(da: xr.DataArray, out_freq: str, time_agg: str, lat_name: str, lon_name: str) -> xr.DataArray:
    """Aggregate grid in time (returns grid with time dim)."""
    out_freq = out_freq.lower()
    time_agg = time_agg.lower()

    if out_freq == "daily":
        return da

    if out_freq == "yearly":
        out = da.groupby("time.year").sum("time") if time_agg == "sum" else da.groupby("time.year").mean("time")
        out = out.rename({"year": "time"})
        years = out["time"].values.astype(int)
        out = out.assign_coords(time=("time", pd.to_datetime([f"{y}-01-01" for y in years])))
        return out

    if out_freq == "monthly":
        out = da.groupby("time.dt.strftime('%Y-%m')").sum("time") if time_agg == "sum" else da.groupby("time.dt.strftime('%Y-%m')").mean("time")
        gdim = [d for d in out.dims if d not in (lat_name, lon_name)][0]
        out = out.rename({gdim: "time"})
        ym = out["time"].values.astype(str)
        out = out.assign_coords(time=("time", pd.to_datetime([f"{s}-01" for s in ym])))
        return out

    raise ValueError("out_freq must be daily|monthly|yearly")


def spatial_aggregate_da(
    da: xr.DataArray,
    mask: Optional[xr.DataArray],
    lat_name: str,
    lon_name: str,
    space_agg: str,
    area_weighted: bool,
) -> pd.Series:
    """Spatial aggregation for gridded DataArray -> pandas Series over time."""
    space_agg = space_agg.lower()
    if mask is not None:
        da = da.where(mask)

    if space_agg == "mean":
        if area_weighted:
            weights = np.cos(np.deg2rad(da[lat_name]))
            out = da.weighted(weights).mean(dim=[lat_name, lon_name])
        else:
            out = da.mean(dim=[lat_name, lon_name], skipna=True)
    elif space_agg == "sum":
        out = da.sum(dim=[lat_name, lon_name], skipna=True)
    else:
        raise ValueError("space_agg must be mean|sum")

    s = out.to_series()
    s.index.name = "time"
    return s


def extract_points(
    da: xr.DataArray,
    lat_name: str,
    lon_name: str,
    lats: List[float],
    lons: List[float],
    names: Optional[List[str]],
) -> pd.DataFrame:
    if len(lats) != len(lons):
        raise ValueError("points lat/lon must have same length")
    if names is None:
        names = [f"pt{i+1}" for i in range(len(lats))]
    if len(names) != len(lats):
        raise ValueError("points names must match lat/lon length")

    cols = []
    for nm, la, lo in zip(names, lats, lons):
        sel = da.sel({lat_name: la, lon_name: lo}, method="nearest")
        s = sel.to_series()
        s.name = nm
        cols.append(s)

    df = pd.concat(cols, axis=1)
    df.index.name = "time"
    return df


# ----------------------------
# Main
# ----------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description="NetCDF -> CSV timeseries using INI config.")
    ap.add_argument("--config", required=True, help="Path to config.ini")
    args = ap.parse_args()

    cfg = read_ini(args.config)

    in_str = get_str(cfg, "paths", "input")
    out_str = get_str(cfg, "paths", "output")
    var = get_str(cfg, "paths", "var")
    if in_str is None or out_str is None or var is None:
        raise ValueError("Missing required [paths] keys: input, output, var")

    in_path = Path(in_str)
    out_path = ensure_csv_extension(Path(out_str))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if not in_path.exists():
        raise FileNotFoundError(f"Input file not found: {in_path}")

    out_freq = (get_str(cfg, "time", "out_freq", "daily") or "daily").lower()
    start = normalize_date_str(get_str(cfg, "time", "start", None))
    end = normalize_date_str(get_str(cfg, "time", "end", None))
    time_agg = (get_str(cfg, "time", "time_agg", "mean") or "mean").lower()

    # NEW: aggregation order for aggregated outputs
    agg_order = (get_str(cfg, "time", "agg_order", "time_then_space") or "time_then_space").lower()
    if agg_order not in ("space_then_time", "time_then_space"):
        raise ValueError("time.agg_order must be space_then_time or time_then_space")

    space_agg = (get_str(cfg, "space", "space_agg", "mean") or "mean").lower()
    area_weighted = get_bool(cfg, "space", "area_weighted", False)

    per_cell_points = get_bool(cfg, "outputs", "per_cell_points", False)
    full_domain_agg = get_bool(cfg, "outputs", "full_domain_agg", False)
    area_agg = get_bool(cfg, "outputs", "area_agg", False)

    pts_lat = parse_csv_floats(get_str(cfg, "points", "lat", None)) if per_cell_points else None
    pts_lon = parse_csv_floats(get_str(cfg, "points", "lon", None)) if per_cell_points else None
    pts_name = parse_csv_strs(get_str(cfg, "points", "name", None)) if per_cell_points else None

    bbox = parse_bbox(get_str(cfg, "area", "bbox", None))

    mask_path = get_str(cfg, "mask", "path", None)
    mask_var = get_str(cfg, "mask", "var", None)
    mask_equals = get_float(cfg, "mask", "equals", None)
    mask_threshold = get_float(cfg, "mask", "threshold", None)

    ds = xr.open_dataset(in_path)
    ds = ensure_time_index(ds)
    if var not in ds:
        raise ValueError(f"Variable '{var}' not found. Available: {list(ds.data_vars)}")

    da0 = ds[var]
    lat_name, lon_name = detect_lat_lon(da0)
    da0 = sort_lat_if_needed(da0, lat_name)

    # Slice daily data first
    da0 = apply_time_slice(da0, start, end)

    # Build area mask on daily grid (same grid)
    area_mask = None
    if mask_path is not None and mask_path.strip() != "":
        if mask_var is None or mask_var.strip() == "":
            raise ValueError("Mask 'path' is set, but mask 'var' is missing in [mask].")
        area_mask = load_mask(mask_path, mask_var, da0, lat_name, lon_name, mask_threshold, mask_equals)

    if bbox is not None:
        bbm = bbox_mask(da0, lat_name, lon_name, bbox)
        area_mask = bbm if area_mask is None else (area_mask & bbm)

    outputs: List[pd.DataFrame] = []

    # Per-cell points always from daily sliced grid, then (optionally) time-aggregate by pandas if desired
    if per_cell_points:
        if not pts_lat or not pts_lon:
            raise ValueError("per_cell_points=true but [points] lat/lon is missing.")
        df_pts_daily = extract_points(da0, lat_name, lon_name, pts_lat, pts_lon, pts_name)
        # Aggregate points to requested out_freq
        if out_freq != "daily":
            df_pts = pd.DataFrame(index=aggregate_series_time(df_pts_daily.iloc[:, 0], out_freq, time_agg).index)
            for c in df_pts_daily.columns:
                df_pts[c] = aggregate_series_time(df_pts_daily[c], out_freq, time_agg).values
        else:
            df_pts = df_pts_daily
        df_pts = df_pts.add_prefix(f"{var}_")
        outputs.append(df_pts)

    # Aggregated outputs
    def make_agg_series(mask: Optional[xr.DataArray], label: str) -> pd.DataFrame:
        if agg_order == "space_then_time":
            # 1) spatial aggregate DAILY -> 1D series, then 2) time aggregate series
            s_daily = spatial_aggregate_da(da0, mask, lat_name, lon_name, space_agg, area_weighted)
            s_out = aggregate_series_time(s_daily, out_freq, time_agg)
            wtag = "aw" if (area_weighted and space_agg == "mean") else "uw"
            return s_out.to_frame(name=f"{var}_{label}_space_{space_agg}_{wtag}_order_ST")
        else:
            # 1) time aggregate on grid, then 2) spatial aggregate on aggregated grid
            da_t = time_aggregate_grid(da0, out_freq, time_agg, lat_name, lon_name)
            s_out = spatial_aggregate_da(da_t, mask, lat_name, lon_name, space_agg, area_weighted)
            wtag = "aw" if (area_weighted and space_agg == "mean") else "uw"
            return s_out.to_frame(name=f"{var}_{label}_space_{space_agg}_{wtag}_order_TS")

    if full_domain_agg:
        outputs.append(make_agg_series(None, "full_domain"))

    if area_agg:
        outputs.append(make_agg_series(area_mask, "area"))

    if not outputs:
        raise ValueError("No outputs enabled. Set at least one of outputs.* = true in [outputs].")

    # Merge and write
    df_out = outputs[0]
    for df in outputs[1:]:
        df_out = df_out.join(df, how="outer")

    df_out.to_csv(out_path, index=True)
    print(f"Saved: {out_path} | rows={len(df_out)} cols={df_out.shape[1]}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        raise
