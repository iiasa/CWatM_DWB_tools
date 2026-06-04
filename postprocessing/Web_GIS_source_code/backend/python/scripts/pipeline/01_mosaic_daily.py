#!/usr/bin/env python3
# 01_mosaic_daily.py
#
# Based on /Users/lang/Documents/DWB Scripts/mosaic_values_nc_netcdf4_parallel.py.
# Same mosaic logic; the only change is a wrapper that loops over the 10 DWB
# variables × 4 regional daily NetCDFs and produces one danube_<var>_daily.nc
# per variable in OUT_DIR.
#
# Per-variable behaviour is byte-identical to running the original script with:
#   IN_DIR = <staging dir containing 4 regional <var>_daily.nc files>
#   OUT_NC = <OUT_DIR>/danube_<var>_daily.nc

import os, glob, re
from pathlib import Path
import numpy as np
import xarray as xr
from netCDF4 import Dataset as NC, date2num

# === Config ===
REGION_DIRS = [
    "/Users/lang/Documents/DWB Data/Drava/out",
    "/Users/lang/Documents/DWB Data/Lower/out",
    "/Users/lang/Documents/DWB Data/Middle/out",
    "/Users/lang/Documents/DWB Data/Morava/out",
    "/Users/lang/Documents/DWB Data/Sava/out",
    "/Users/lang/Documents/DWB Data/Tisa/out",
    "/Users/lang/Documents/DWB Data/Upper/out",
]
OUT_DIR = "/Users/lang/Documents/DWB NEW Data/danube_daily"
VARIABLES = [
    "ETRef", "IceMelt", "Rain", "SnowFraction", "SnowMelt",
    "Snow", "runoff", "totalET_WB", "tws", "discharge",
]

# === Parameters (identical to original mosaic_values_nc_netcdf4_parallel.py) ===
TIME_JOIN = "outer"           # 'exact' | 'inner' | 'outer'
INTERP_LON = "nearest"        # 'nearest' | 'linear'
INTERP_LAT = "nearest"
OVERLAP_POLICY = "first"      # 'first'|'last'|'max'|'min'|'sum'|'mean'
DTYPE = "float32"
COMP_LEVEL = 4
FORCE_DLAT = None
FORCE_DLON = None
INCLUDE_VARS = None
EXCLUDE_VARS = []

# === Helpers (verbatim from original) ===
def _natural_sort_key(s: str):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', s)]

def _guess_lat_lon_names(ds: xr.Dataset):
    lat = next((n for n in ds.coords if n.lower() in ("lat","latitude","y")), None)
    lon = next((n for n in ds.coords if n.lower() in ("lon","longitude","x")), None)
    return lat, lon

def _is_1d_grid(ds: xr.Dataset, lat: str, lon: str) -> bool:
    return lat in ds.dims and lon in ds.dims and ds[lat].ndim == 1 and ds[lon].ndim == 1

def _ensure_increasing(a: xr.DataArray) -> xr.DataArray:
    if a.size > 1 and a.values[1] < a.values[0]:
        return a.sortby(a.name)
    return a

def _step_1d(arr: np.ndarray) -> float:
    dif = np.diff(arr.astype(float))
    dif = dif[np.isfinite(dif)]
    return float(np.median(dif)) if dif.size else 0.01

def _make_common_grid(dsets, lat_name, lon_name, force_dlat=None, force_dlon=None):
    lat_mins, lat_maxs, dlat_all = [], [], []
    lon_mins, lon_maxs, dlon_all = [], [], []
    for ds in dsets:
        lat = _ensure_increasing(ds[lat_name]); lon = _ensure_increasing(ds[lon_name])
        lat_mins.append(float(lat.values[0])); lat_maxs.append(float(lat.values[-1]))
        lon_mins.append(float(lon.values[0])); lon_maxs.append(float(lon.values[-1]))
        if lat.size > 1: dlat_all.append(_step_1d(lat.values))
        if lon.size > 1: dlon_all.append(_step_1d(lon.values))
    lat_min, lat_max = min(lat_mins), max(lat_maxs)
    lon_min, lon_max = min(lon_mins), max(lon_maxs)
    dlat = float(np.min(dlat_all)) if force_dlat is None else float(force_dlat)
    dlon = float(np.min(dlon_all)) if force_dlon is None else float(force_dlon)
    eps = 1e-9
    n_lat = int(np.floor((lat_max - lat_min) / dlat + eps)) + 1
    n_lon = int(np.floor((lon_max - lon_min) / dlon + eps)) + 1
    lat_vec = np.round(lat_min + np.arange(n_lat) * dlat, 12)
    lon_vec = np.round(lon_min + np.arange(n_lon) * dlon, 12)
    LAT = xr.DataArray(lat_vec, dims=("lat",), name="lat")
    LON = xr.DataArray(lon_vec, dims=("lon",), name="lon")
    return LAT, LON

def _time_union_or_intersection(dsets, how):
    times = []
    for ds in dsets:
        if "time" in ds.coords:
            times.append(ds.indexes["time"].values.astype("datetime64[ns]"))
    if not times:
        return np.array([], dtype="datetime64[ns]")
    if how == "exact":
        ref = times[0]
        for t in times[1:]:
            if not np.array_equal(ref, t):
                raise ValueError("TIME_JOIN='exact': vremena nisu identična.")
        return ref
    sets = [set(map(np.datetime64, t)) for t in times]
    common = set.intersection(*sets) if how == "inner" else set.union(*sets)
    return np.array(sorted(common), dtype="datetime64[ns]")

def _interp_to_grid(da, lat_name, lon_name, LAT, LON):
    da = da.sortby(lon_name).interp({lon_name: LON}, method=INTERP_LON)
    da = da.sortby(lat_name).interp({lat_name: LAT}, method=INTERP_LAT)
    if lat_name != "lat": da = da.rename({lat_name: "lat"})
    if lon_name != "lon": da = da.rename({lon_name: "lon"})
    return da

def _apply_overlap(policy, acc, new):
    if policy == "first":
        return xr.where(xr.ufuncs.isnan(acc), new, acc)
    if policy == "last":
        return xr.where(xr.ufuncs.isnan(new), acc, new)
    if policy == "max":
        return xr.ufuncs.fmax(acc, new).where(~(xr.ufuncs.isnan(acc) & xr.ufuncs.isnan(new)), np.nan)
    if policy == "min":
        return xr.ufuncs.fmin(acc, new).where(~(xr.ufuncs.isnan(acc) & xr.ufuncs.isnan(new)), np.nan)
    if policy == "sum":
        a = xr.where(xr.ufuncs.isnan(acc), 0, acc)
        b = xr.where(xr.ufuncs.isnan(new), 0, new)
        s = a + b
        both_nan = xr.ufuncs.isnan(acc) & xr.ufuncs.isnan(new)
        return s.where(~both_nan, np.nan)
    raise ValueError("Za 'mean' koristimo posebnu logiku.")

# === Core mosaic (refactored from original main() to accept files + out path) ===
def mosaic_files_to_nc(files, out_nc):
    if not files:
        raise FileNotFoundError("No input files passed to mosaic_files_to_nc")

    files = sorted(files, key=_natural_sort_key)
    dsets = [xr.open_dataset(p) for p in files]
    try:
        lat0, lon0 = _guess_lat_lon_names(dsets[0])
        if not lat0 or not lon0:
            raise ValueError("Ne nalazim lat/lon u prvom dataset-u.")
        for i, ds in enumerate(dsets, start=1):
            li, lo = _guess_lat_lon_names(ds)
            if not li or not lo:
                raise ValueError(f"[#{i}] Nedostaju lat/lon.")
            if not _is_1d_grid(ds, li, lo):
                raise ValueError(f"[#{i}] 2D/curvilinear grid (mogu poslati xESMF varijantu).")

        LAT, LON = _make_common_grid(dsets, lat0, lon0, FORCE_DLAT, FORCE_DLON)
        time_vals = _time_union_or_intersection(dsets, TIME_JOIN)
        has_time = time_vals.size > 0

        all_vars = sorted(set().union(*[set(ds.data_vars) for ds in dsets]))
        if INCLUDE_VARS is not None:
            all_vars = [v for v in all_vars if v in INCLUDE_VARS]
        if EXCLUDE_VARS:
            all_vars = [v for v in all_vars if v not in EXCLUDE_VARS]
        if not all_vars:
            raise ValueError("Nema varijabli za obradu.")

        os.makedirs(os.path.dirname(out_nc), exist_ok=True)

        with NC(out_nc, "w", format="NETCDF4") as nc:
            nc.createDimension("lat", LAT.size)
            nc.createDimension("lon", LON.size)
            if has_time:
                nc.createDimension("time", None)

            lat_var = nc.createVariable("lat", "f8", ("lat",))
            lon_var = nc.createVariable("lon", "f8", ("lon",))
            lat_var[:] = LAT.values
            lon_var[:] = LON.values
            lat_var.units = "degrees_north"
            lon_var.units = "degrees_east"

            if has_time:
                time_var = nc.createVariable("time", "i8", ("time",))
                secs = (time_vals.astype("datetime64[s]").astype("int64"))
                time_var[:] = secs
                time_var.units = "seconds since 1970-01-01 00:00:00 UTC"
                time_var.calendar = "standard"

            for v in all_vars:
                dims = ("lat","lon") if not has_time else ("time","lat","lon")
                nc.createVariable(
                    v, "f4", dims,
                    zlib=True, complevel=COMP_LEVEL, shuffle=True, fill_value=np.nan
                )
                # Preserve units from the first dataset that has the variable.
                for ds in dsets:
                    if v in ds.data_vars:
                        src_units = ds[v].attrs.get("units")
                        if src_units:
                            nc.variables[v].units = src_units
                        src_long = ds[v].attrs.get("long_name")
                        if src_long:
                            nc.variables[v].long_name = src_long
                        break

        t_index = {np.datetime64(t): i for i, t in enumerate(time_vals)} if has_time else {}

        for v in all_vars:
            print(f"  [VAR] {v}")
            if has_time:
                for t in time_vals:
                    acc = None
                    sum_da = None; cnt_da = None

                    for ds in dsets:
                        if v not in ds.data_vars:
                            continue
                        li, lo = _guess_lat_lon_names(ds)
                        da = ds[v]
                        if "time" in da.dims:
                            ds_times = set(map(np.datetime64, da.indexes["time"].values))
                            if np.datetime64(t) not in ds_times:
                                continue
                            sli = da.sel(time=t)
                        else:
                            sli = da

                        sli = _interp_to_grid(sli, li, lo, LAT, LON).astype(DTYPE)

                        if OVERLAP_POLICY == "mean":
                            valid = (~xr.ufuncs.isnan(sli)).astype("float32")
                            if sum_da is None:
                                sum_da = xr.where(valid>0, sli, 0.0)
                                cnt_da = valid
                            else:
                                sum_da = sum_da + xr.where(valid>0, sli, 0.0)
                                cnt_da = cnt_da + valid
                        else:
                            acc = sli if acc is None else _apply_overlap(OVERLAP_POLICY, acc, sli)

                    if OVERLAP_POLICY == "mean":
                        acc = xr.where((cnt_da>0), (sum_da / xr.where(cnt_da>0, cnt_da, 1.0)), np.nan)

                    if acc is None:
                        continue

                    i = t_index[np.datetime64(t)]
                    with NC(out_nc, "a") as nc:
                        nc.variables[v][i, :, :] = acc.to_numpy()
            else:
                acc = None
                sum_da = None; cnt_da = None
                for ds in dsets:
                    if v not in ds.data_vars:
                        continue
                    li, lo = _guess_lat_lon_names(ds)
                    sli = _interp_to_grid(ds[v], li, lo, LAT, LON).astype(DTYPE)
                    if OVERLAP_POLICY == "mean":
                        valid = (~xr.ufuncs.isnan(sli)).astype("float32")
                        if sum_da is None:
                            sum_da = xr.where(valid>0, sli, 0.0)
                            cnt_da = valid
                        else:
                            sum_da = sum_da + xr.where(valid>0, sli, 0.0)
                            cnt_da = cnt_da + valid
                    else:
                        acc = sli if acc is None else _apply_overlap(OVERLAP_POLICY, acc, sli)

                if OVERLAP_POLICY == "mean":
                    acc = xr.where((cnt_da>0), (sum_da / xr.where(cnt_da>0, cnt_da, 1.0)), np.nan)

                if acc is not None:
                    with NC(out_nc, "a") as nc:
                        nc.variables[v][:, :] = acc.to_numpy()

        print(f"  [OK] Saved: {out_nc}")

    finally:
        for ds in dsets:
            try: ds.close()
            except Exception: pass


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    for var in VARIABLES:
        print(f"\n[VAR] {var} — collecting regional files…")
        files = []
        for region_dir in REGION_DIRS:
            candidate = os.path.join(region_dir, f"{var}_daily.nc")
            if os.path.isfile(candidate):
                files.append(candidate)
            else:
                print(f"  [SKIP] missing: {candidate}")

        if not files:
            print(f"  [WARN] No files for {var}; skipping.")
            continue

        if len(files) < len(REGION_DIRS):
            print(f"  [INFO] Mosaicking {len(files)}/{len(REGION_DIRS)} regions for {var}")
        else:
            print(f"  [INFO] Mosaicking all {len(files)} regions for {var}")

        out_nc = os.path.join(OUT_DIR, f"danube_{var}_daily.nc")
        try:
            mosaic_files_to_nc(files, out_nc)
        except Exception as e:
            print(f"  [ERR] Mosaic failed for {var}: {e}")


if __name__ == "__main__":
    main()
