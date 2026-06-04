#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# 03_subbasins_to_parquet.py
#
# Based on /Users/lang/Documents/DWB Scripts/subbasins.py.
# Changes vs. original:
#   1. Paths point to /Users/lang/Documents/DWB NEW Data/
#   2. Output filenames are `subbasin_<pid>.parquet` (the app's
#      get_subbasin_data.py expects this exact prefix)
#   3. POLY_ID_FIELD must be the GeoJSON property whose values are
#      sequential integers 0..644 (run 00_export_subbasins_geojson.py
#      first and inspect property keys + values to pick the right one).
#
# Jedan Parquet po subbazenu sa kolonama:
#   time, <nc>_avg, <nc>_sum, ... (za SVE .nc u IN_DIR)

import os, glob, time, warnings
import numpy as np
import pandas as pd
import xarray as xr
import pyarrow as pa
import pyarrow.parquet as pq
import geopandas as gpd
from shapely.geometry import MultiPolygon, Point
from shapely.prepared import prep
from shapely.ops import unary_union
import rasterio
from rasterio.features import rasterize
import dask
from dask.distributed import Client, LocalCluster

# ================ KONFIG ================
IN_DIR   = "/Users/lang/Documents/DWB NEW Data/nc/month"
GEOJSON  = "/Users/lang/Documents/DWB NEW Data/subbasins.geojson"
OUT_DIR  = "/Users/lang/Documents/DWB NEW Data/subbasins"

# Property iz subbasins.geojson čija vrednost identifikuje subbazen.
# Backend (subbasins.service.ts) traži fajl `subbasin_${subbasinId}.parquet`,
# gde `subbasinId` dolazi sa MVT tile-a kao `id` (PG primarni ključ, 1..645).
# Postojeći fajlovi 0..644 su (skoro sigurno) misaligned sa pravim ID-em;
# nova pipeline koristi PG `id` da poravnamo sa onim što backend stvarno
# pita. Rezultat: subbasin_1.parquet .. subbasin_645.parquet.
POLY_ID_FIELD     = "id"
VAR_NAME_DEFAULT  = None            # ako None -> prva prostorna var iz .nc

LIMIT_ROWS        = None            # prvih N timesteps po svakom .nc
TIME_CHUNK        = 16              # chunk po vremenu (generalno)
SPACE_CHUNK_Y     = 64              # npr. 256 ako želiš prostorno chunkovanje
SPACE_CHUNK_X     = 64

JOIN_MODE         = "outer"         # "outer" | "inner" (merge vremena među layer-ima)
DASK_SCHEDULER    = "threads"       # "threads" | "processes"
PARQUET_COMPRESSION = "snappy"

# Na 8 GB Mac-u, LocalCluster sa više workera kopira 332 MiB mask
# stack u svaki worker → OOM. In-process threads dele memoriju i ne
# kopiraju graf. Postavi USE_LOCAL_CLUSTER = False za thread scheduler.
USE_LOCAL_CLUSTER = False
MAX_WORKERS       = 4               # samo ako USE_LOCAL_CLUSTER = True
# =======================================

warnings.filterwarnings("ignore", category=FutureWarning, module="xarray")

Y_CANDS = ("y", "lat", "latitude", "row")
X_CANDS = ("x", "lon", "longitude", "col")
T_CANDS = ("time", "date", "datetime")

MASK_CACHE = {}  # grid_signature -> dict(pid -> mask_bool_NyNx)

def ensure_dir(p): os.makedirs(p, exist_ok=True)

def find_dim(ds, cands):
    for c in cands:
        if c in ds.dims: return c
    for c in cands:
        if c in ds.coords: return c
    raise ValueError(f"Nisam našao dimenziju iz: {cands}")

def get_time_dim(ds):
    for c in T_CANDS:
        if c in ds.dims or c in ds.coords: return c
    return None

def data_vars_spatial(ds, ydim, xdim):
    skip = {"lat", "latitude", "lon", "longitude"}
    out = []
    for v in ds.data_vars:
        if v in skip: continue
        dims = set(ds[v].dims)
        if ydim in dims and xdim in dims: out.append(v)
    if not out:
        raise ValueError("Nema prostornih promenljivih sa (y/x) ili (lat/lon).")
    return out

def latlon_grid(ds, ydim, xdim):
    for lat_name in ("lat", "latitude"):
        for lon_name in ("lon", "longitude"):
            if lat_name in ds.coords and lon_name in ds.coords:
                lat = ds[lat_name].values; lon = ds[lon_name].values
                if lat.ndim == 2 and lon.ndim == 2:
                    return lat.astype("float64"), lon.astype("float64"), "2d"
                if lat.ndim == 1 and lon.ndim == 1:
                    return lat.astype("float64"), lon.astype("float64"), "1d"
    return ds.coords[ydim].values.astype("float64"), ds.coords[xdim].values.astype("float64"), "fallback"

def approx_uniform_spacing(arr, rtol=1e-3):
    d = np.diff(arr); d_mean = np.mean(np.abs(d))
    if d_mean == 0 or not np.all(np.isfinite(d)): return False, np.nan
    ok = np.allclose(d, d_mean, rtol=rtol, atol=0)
    return bool(ok), float(abs(d_mean))

def affine_from_1d_latlon(lat1d, lon1d):
    from affine import Affine
    lon_ok, dx = approx_uniform_spacing(lon1d)
    lat_ok, dy = approx_uniform_spacing(lat1d)
    if not (lon_ok and lat_ok): return None
    minx, maxx = float(np.min(lon1d)), float(np.max(lon1d))
    miny, maxy = float(np.min(lat1d)), float(np.max(lat1d))
    return Affine.translation(minx - dx/2.0, maxy + dy/2.0) * Affine.scale(abs(dx), -abs(dy))

def is_multipoly(g): return isinstance(g, MultiPolygon)

def _masks_by_point_in_poly(gdf, id_field, LON2D, LAT2D):
    Ny, Nx = LON2D.shape
    xs = LON2D.ravel(); ys = LAT2D.ravel()
    pts = [Point(px, py) for px, py in zip(xs, ys)]
    masks = {}
    for _, row in gdf.iterrows():
        pid = row[id_field]
        geom = row.geometry
        if geom is None or geom.is_empty: continue
        if is_multipoly(geom):
            geom = unary_union([g for g in geom.geoms if (g is not None and not g.is_empty)])
        pg = prep(geom)
        inside = np.fromiter((pg.contains(p) for p in pts), dtype=bool, count=len(pts))
        masks[pid] = inside.reshape(Ny, Nx)
    return masks

def build_masks_for_polys(gdf, id_field, lat_axis, lon_axis, mode):
    if gdf.crs is None: gdf = gdf.set_crs(epsg=4326)
    else: gdf = gdf.to_crs(epsg=4326)

    if mode == "1d":
        lat1d, lon1d = lat_axis, lon_axis
        Ny, Nx = len(lat1d), len(lon1d)
        transform = affine_from_1d_latlon(lat1d, lon1d)
        if transform is not None:
            masks = {}
            for _, row in gdf.iterrows():
                pid = row[id_field]
                geom = row.geometry
                if geom is None or geom.is_empty: continue
                mask = rasterize(
                    [(geom, 1)],
                    out_shape=(Ny, Nx),
                    transform=transform,
                    fill=0, dtype="uint8",
                    all_touched=False
                ).astype(bool)
                masks[pid] = mask
            return masks
        lon2d, lat2d = np.meshgrid(lon1d, lat1d)
        return _masks_by_point_in_poly(gdf, id_field, lon2d, lat2d)
    else:
        LAT2D, LON2D = lat_axis, lon_axis
        return _masks_by_point_in_poly(gdf, id_field, LON2D, LAT2D)

def grid_signature(lat_axis, lon_axis, mode):
    if mode == "1d":
        return ("1d", int(lat_axis.shape[0]), int(lon_axis.shape[0]),
                float(lat_axis[0]), float(lat_axis[-1]),
                float(lon_axis[0]), float(lon_axis[-1]))
    else:
        return (("2d" if mode == "2d" else "fallback"),
                tuple(lat_axis.shape), tuple(lon_axis.shape),
                float(lat_axis.flat[0]), float(lat_axis.flat[-1]),
                float(lon_axis.flat[0]), float(lon_axis.flat[-1]))

def compute_stats_for_nc(nc_path, gdf):
    nc_base = os.path.splitext(os.path.basename(nc_path))[0]
    print(f"\n[NC] {nc_base}")

    ds = xr.open_dataset(nc_path, decode_cf=True, chunks={})

    ydim = find_dim(ds, Y_CANDS)
    xdim = find_dim(ds, X_CANDS)
    tdim = get_time_dim(ds)
    if tdim is None:
        print(f"[WARN] Preskačem '{nc_base}' – nema vremensku dimenziju.")
        return {}

    vars_list = data_vars_spatial(ds, ydim, xdim)
    var = VAR_NAME_DEFAULT if (VAR_NAME_DEFAULT and VAR_NAME_DEFAULT in ds.data_vars) else vars_list[0]
    print(f"[INFO] Var: {var}")

    lat_axis, lon_axis, mode = latlon_grid(ds, ydim, xdim)
    sig = grid_signature(lat_axis, lon_axis, mode)
    if sig in MASK_CACHE:
        masks = MASK_CACHE[sig]
        print(f"[INFO] Grid maske iz keša.")
    else:
        print(f"[INFO] Gradim maske (mode={mode})…")
        masks = build_masks_for_polys(gdf, POLY_ID_FIELD, lat_axis, lon_axis, mode)
        MASK_CACHE[sig] = masks
        print(f"[INFO] Maska gotova za {len(masks)} poligona. (keširano)")

    pid_list = list(masks.keys())
    if not pid_list:
        return {}

    tlen = int(ds.sizes[tdim])
    rows_total = min(LIMIT_ROWS or tlen, tlen)
    time_vals = pd.to_datetime(ds[tdim].values[:rows_total])

    chunks = {tdim: TIME_CHUNK}
    if SPACE_CHUNK_Y: chunks[ydim] = SPACE_CHUNK_Y
    if SPACE_CHUNK_X: chunks[xdim] = SPACE_CHUNK_X
    ds = ds.chunk(chunks)

    da = ds[var].astype("float32")  # (time, y, x)

    mask_stack = np.stack([masks[pid] for pid in pid_list], axis=0)
    # rasterize() emits a north-up image (row 0 = max lat). When the dataset's
    # lat coord is ascending (row 0 = min lat), `data.where(mask)` aligns the
    # mask positionally and we end up sampling the wrong pixel band. Flip the
    # mask along the y-axis to match the data's row order, then attach lat/lon
    # coords so xarray validates the alignment by value.
    if mode == "1d" and lat_axis.size > 1 and lat_axis[0] < lat_axis[-1]:
        mask_stack = mask_stack[:, ::-1, :]
    mask_coords = {"pid": pid_list}
    if mode == "1d":
        mask_coords[ydim] = ds[ydim].values
        mask_coords[xdim] = ds[xdim].values
    mask_da = xr.DataArray(mask_stack, dims=("pid", ydim, xdim), coords=mask_coords)

    col_avg = f"{nc_base}_avg"
    col_sum = f"{nc_base}_sum"

    results = {pid: None for pid in pid_list}

    for start in range(0, rows_total, TIME_CHUNK):
        stop = min(start + TIME_CHUNK, rows_total)
        sel = {tdim: slice(start, stop)}
        block = da.isel(sel)

        block4d = block.expand_dims({"pid": mask_da["pid"]})
        masked4d = block4d.where(mask_da)

        vavg_da = masked4d.mean(dim=(ydim, xdim), skipna=True)
        vsum_da = masked4d.sum (dim=(ydim, xdim), skipna=True)
        vavg, vsum = dask.compute(vavg_da, vsum_da)

        time_slice = pd.to_datetime(time_vals[start:stop].values)
        for pid in pid_list:
            df_part = pd.DataFrame({
                "time": time_slice,
                col_avg: vavg.sel(pid=pid).values.astype(np.float32),
                col_sum: vsum.sel(pid=pid).values.astype(np.float32),
            })
            if results[pid] is None:
                results[pid] = df_part
            else:
                results[pid] = pd.concat([results[pid], df_part], axis=0, ignore_index=True)

    for pid in pid_list:
        if results[pid] is not None:
            results[pid] = results[pid].sort_values("time").reset_index(drop=True)

    return results

def main():
    ensure_dir(OUT_DIR)

    dask.config.set(scheduler=DASK_SCHEDULER)
    client = None
    if USE_LOCAL_CLUSTER:
        try:
            n_workers = min(MAX_WORKERS, os.cpu_count() or 1)
            cluster = LocalCluster(
                n_workers=n_workers,
                threads_per_worker=1,
                processes=(DASK_SCHEDULER == "processes"),
                dashboard_address=None
            )
            client = Client(cluster)
            print(f"[DASK] {client}")
        except Exception as e:
            print(f"[DASK] Bez LocalCluster-a ({e}).")
    else:
        print(f"[DASK] in-process scheduler='{DASK_SCHEDULER}'")

    t0 = time.time()

    gdf = gpd.read_file(GEOJSON)
    if POLY_ID_FIELD not in gdf.columns:
        raise KeyError(
            f"GeoJSON ne sadrži kolonu '{POLY_ID_FIELD}'. "
            f"Dostupne kolone: {list(gdf.columns)}"
        )
    if gdf.crs is None: gdf = gdf.set_crs(epsg=4326)
    else: gdf = gdf.to_crs(epsg=4326)

    subbasin_frames = {}  # pid -> DataFrame

    nc_paths = sorted(glob.glob(os.path.join(IN_DIR, "*.nc")))
    if not nc_paths:
        print(f"[WARN] Nema .nc fajlova u {IN_DIR}")
        return
    print(f"[INFO] Pronađeno .nc fajlova: {len(nc_paths)}")

    for nc_path in nc_paths:
        try:
            per_pid = compute_stats_for_nc(nc_path, gdf)
            for pid, small_df in per_pid.items():
                if small_df is None:
                    continue
                if pid not in subbasin_frames:
                    subbasin_frames[pid] = small_df
                else:
                    how = "outer" if JOIN_MODE == "outer" else "inner"
                    subbasin_frames[pid] = pd.merge(
                        subbasin_frames[pid], small_df, on="time", how=how, sort=True,
                    )
        except Exception as e:
            print(f"[ERROR] Problem sa '{os.path.basename(nc_path)}': {e}")

    # Upis: jedan Parquet po subbazenu — prefix `subbasin_` da odgovara
    # postojećoj konvenciji (get_subbasin_data.py traži subbasin_<id>.parquet).
    for pid, df in subbasin_frames.items():
        if df is None or df.empty:
            print(f"[WARN] Preskačem PID={pid} (nema podataka).")
            continue
        df = df.sort_values("time").reset_index(drop=True)
        out_path = os.path.join(OUT_DIR, f"subbasin_{pid}.parquet")
        table = pa.Table.from_pandas(df, preserve_index=False)
        pq.write_table(table, out_path, compression=PARQUET_COMPRESSION)
        print(f"[OK] subbasin_{pid}.parquet  → kolona: {len(df.columns)}  redova: {len(df)}")

    print(f"[DONE] Ukupno vreme: {time.time()-t0:.2f}s")

    if 'client' in locals() and client is not None:
        client.close()

if __name__ == "__main__":
    main()
