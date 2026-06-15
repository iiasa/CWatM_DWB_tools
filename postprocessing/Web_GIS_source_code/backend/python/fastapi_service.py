#!/usr/bin/env python3
"""
FastAPI sidecar service for DWB point-graph data extraction.

Pre-loads all NetCDF datasets at startup and serves point-data queries
via SSE streaming. Eliminates the cold-start overhead (~3-5s) of spawning
a new Python process per request and removes HDF5 lock contention.
"""

import os
import json
import time
import asyncio
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

import numpy as np
import pandas as pd
import xarray as xr
from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATA_DIR = Path(os.environ.get("DATA_DIR", "/app/data"))
NC_DIR = DATA_DIR / "nc" / "month"
THREAD_POOL_SIZE = int(os.environ.get("THREAD_POOL_SIZE", "4"))

NC_FILES = [
    "danube_discharge_monthly.nc",
    "danube_ETRef_monthly.nc",
    "danube_IceMelt_monthly.nc",
    "danube_Rain_monthly.nc",
    "danube_runoff_monthly.nc",
    "danube_Snow_monthly.nc",
    "danube_SnowFraction_monthly.nc",
    "danube_SnowMelt_monthly.nc",
    "danube_totalET_WB_monthly.nc",
    "danube_tws_monthly.nc",
    "discharge_monthavg.nc",
    "SnowFraction_monthavg.nc",
]

# Module-level state: pre-loaded datasets (populated on startup)
DATASETS: dict[str, xr.Dataset] = {}

# Union bbox of all loaded datasets (populated on startup)
COVERAGE_BBOX: dict[str, float] = {}

# Thread pool for parallel dataset extraction
executor: ThreadPoolExecutor | None = None


def _compute_coverage_bbox(datasets: dict[str, xr.Dataset]) -> dict[str, float]:
    """Return the union lat/lon bbox of all loaded datasets."""
    lat_names = ['lat', 'latitude', 'y']
    lon_names = ['lon', 'longitude', 'x']
    lat_min = lat_max = lon_min = lon_max = None
    for ds in datasets.values():
        lat_dim = next((n for n in lat_names if n in ds.dims), None)
        lon_dim = next((n for n in lon_names if n in ds.dims), None)
        if not lat_dim or not lon_dim:
            continue
        lat_vals = ds[lat_dim].values
        lon_vals = ds[lon_dim].values
        ds_lat_min = float(np.min(lat_vals))
        ds_lat_max = float(np.max(lat_vals))
        ds_lon_min = float(np.min(lon_vals))
        ds_lon_max = float(np.max(lon_vals))
        lat_min = ds_lat_min if lat_min is None else min(lat_min, ds_lat_min)
        lat_max = ds_lat_max if lat_max is None else max(lat_max, ds_lat_max)
        lon_min = ds_lon_min if lon_min is None else min(lon_min, ds_lon_min)
        lon_max = ds_lon_max if lon_max is None else max(lon_max, ds_lon_max)
    if lat_min is None:
        return {}
    return {
        'lat_min': round(lat_min, 6),
        'lat_max': round(lat_max, 6),
        'lon_min': round(lon_min, 6),
        'lon_max': round(lon_max, 6),
    }


# ---------------------------------------------------------------------------
# Lifespan: pre-load datasets once on startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global executor

    executor = ThreadPoolExecutor(max_workers=THREAD_POOL_SIZE)

    if not NC_DIR.exists():
        print(f"WARNING: NetCDF directory not found: {NC_DIR}", flush=True)
    else:
        for nc_file in NC_FILES:
            nc_path = NC_DIR / nc_file
            if nc_path.exists():
                try:
                    ds = xr.open_dataset(nc_path)
                    DATASETS[nc_file] = ds
                    print(f"  Loaded: {nc_file}", flush=True)
                except Exception as e:
                    print(f"  FAILED to load {nc_file}: {e}", flush=True)
            else:
                print(f"  NOT FOUND: {nc_file}", flush=True)

    print(f"Startup complete: {len(DATASETS)}/{len(NC_FILES)} datasets loaded", flush=True)

    global COVERAGE_BBOX
    COVERAGE_BBOX = _compute_coverage_bbox(DATASETS)
    if COVERAGE_BBOX:
        print(
            f"Coverage bbox: lat [{COVERAGE_BBOX['lat_min']}, {COVERAGE_BBOX['lat_max']}], "
            f"lon [{COVERAGE_BBOX['lon_min']}, {COVERAGE_BBOX['lon_max']}]",
            flush=True,
        )
    else:
        print("Coverage bbox: could not be determined (no datasets with lat/lon dims)", flush=True)

    yield

    # Cleanup on shutdown
    for ds in DATASETS.values():
        try:
            ds.close()
        except Exception:
            pass
    DATASETS.clear()
    COVERAGE_BBOX.clear()
    if executor:
        executor.shutdown(wait=False)


app = FastAPI(title="DWB Point Graph API", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Data extraction helpers (ported from get_point_data.py)
# ---------------------------------------------------------------------------

def find_nearest_pixel(ds: xr.Dataset, lat: float, lon: float):
    """Find the nearest grid cell indices for given coordinates."""
    lat_names = ['lat', 'latitude', 'y']
    lon_names = ['lon', 'longitude', 'x']
    lat_dim = next((n for n in lat_names if n in ds.dims), None)
    lon_dim = next((n for n in lon_names if n in ds.dims), None)
    if not lat_dim or not lon_dim:
        return None, None, None, None
    lat_vals = ds[lat_dim].values
    lon_vals = ds[lon_dim].values
    lat_idx = int(np.abs(lat_vals - lat).argmin())
    lon_idx = int(np.abs(lon_vals - lon).argmin())
    return lat_idx, lon_idx, lat_dim, lon_dim


def extract_dataset(nc_file: str, lat: float, lon: float) -> dict | None:
    """Extract time series for a single pre-loaded dataset at the given pixel."""
    ds = DATASETS.get(nc_file)
    if ds is None:
        return None

    time_names = ['time', 'Time', 'DATE', 'date']
    time_dim = next((n for n in time_names if n in ds.dims), None)
    if not time_dim:
        return None

    data_vars = [v for v in ds.data_vars]
    if not data_vars:
        return None
    var_name = data_vars[0]

    lat_idx, lon_idx, lat_dim_name, lon_dim_name = find_nearest_pixel(ds, lat, lon)
    if lat_idx is None or lon_idx is None:
        return None

    # Find dimension names in the variable (may differ from dataset dims)
    lat_names = ['lat', 'latitude', 'y']
    lon_names = ['lon', 'longitude', 'x']
    var_lat_dim = next((n for n in lat_names if n in ds[var_name].dims), None)
    var_lon_dim = next((n for n in lon_names if n in ds[var_name].dims), None)
    if not var_lat_dim or not var_lon_dim:
        return None

    # Extract single pixel — with pre-loaded dataset this is a fast array slice
    pixel_data = ds[var_name].isel({var_lat_dim: lat_idx, var_lon_dim: lon_idx})
    df = pixel_data.to_dataframe().reset_index()

    df['time'] = pd.to_datetime(df[time_dim])
    if df['time'].dt.tz is not None:
        df['time'] = df['time'].dt.tz_localize(None)
    df = df.dropna(subset=['time'])

    if len(df) == 0:
        return None

    # Vectorized conversion
    df_valid = df[['time', var_name]].copy()
    df_valid[var_name] = pd.to_numeric(df_valid[var_name], errors='coerce')
    df_valid = df_valid.dropna(subset=[var_name])
    df_valid = df_valid[np.isfinite(df_valid[var_name])]

    if df_valid.empty:
        return None

    data_points = (
        df_valid.assign(
            date=df_valid['time'].dt.strftime('%Y-%m'),
            value=df_valid[var_name].astype(float)
        )[['date', 'value']]
        .to_dict(orient='records')
    )

    if nc_file.startswith('danube_'):
        clean_name = nc_file.replace('danube_', '').replace('_monthly.nc', '').replace('_', ' ').title()
    else:
        clean_name = nc_file.replace('_monthavg.nc', '').replace('_', ' ').title() + ' (Monthly Avg)'

    return {
        'variable_name': clean_name,
        'file_name': nc_file,
        'data_points': data_points,
        'total_points': len(data_points),
    }


# ---------------------------------------------------------------------------
# SSE formatting helpers
# ---------------------------------------------------------------------------

def sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return JSONResponse({
        "status": "ok",
        "datasets_loaded": len(DATASETS),
        "datasets_expected": len(NC_FILES),
        "thread_pool_size": THREAD_POOL_SIZE,
        "coverage_bbox": COVERAGE_BBOX or None,
    })


@app.get("/coverage")
async def coverage():
    """Return the union bbox of all loaded datasets so clients can guard requests."""
    if not COVERAGE_BBOX:
        raise HTTPException(status_code=503, detail="Coverage bbox not yet available")
    return JSONResponse(COVERAGE_BBOX)


@app.get("/point-data")
async def point_data(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    if not DATASETS:
        raise HTTPException(status_code=503, detail="No datasets loaded")

    # Early bbox guard — points clearly outside coverage get a fast, clear error
    # without spinning up the worker pool.
    out_of_bbox = (
        COVERAGE_BBOX
        and (
            lat < COVERAGE_BBOX['lat_min']
            or lat > COVERAGE_BBOX['lat_max']
            or lon < COVERAGE_BBOX['lon_min']
            or lon > COVERAGE_BBOX['lon_max']
        )
    )

    async def generate_sse():
        start_ts = time.time()
        total_files = len(NC_FILES)
        completed = 0

        if out_of_bbox:
            yield sse_event('error', {
                'error': 'Location outside data coverage',
                'code': 'OUT_OF_BBOX',
                'lat': lat,
                'lon': lon,
                'coverage': COVERAGE_BBOX,
            })
            return

        # Initial progress event
        yield sse_event('progress', {
            'type': 'progress',
            'event': 'start',
            'ts': _now_iso(),
            'completed': 0,
            'total': total_files,
            'workers': THREAD_POOL_SIZE,
        })

        datasets = []
        loop = asyncio.get_event_loop()

        # Stage 1: Process discharge first (sync) for quick partial update
        discharge_file = "danube_discharge_monthly.nc"
        remaining = [f for f in NC_FILES if f != discharge_file]

        if discharge_file in DATASETS:
            result = await loop.run_in_executor(executor, extract_dataset, discharge_file, lat, lon)
            completed += 1
            if result is not None:
                datasets.append(result)
                yield sse_event('partial', {
                    'latitude': lat,
                    'longitude': lon,
                    'dataset': result,
                })
            yield sse_event('progress', {
                'type': 'progress',
                'event': 'update',
                'ts': _now_iso(),
                'completed': completed,
                'total': total_files,
            })

        # Stage 2: Process remaining files in parallel (non-blocking async)
        tasks = [
            loop.run_in_executor(executor, extract_dataset, nc_file, lat, lon)
            for nc_file in remaining
            if nc_file in DATASETS
        ]

        for coro in asyncio.as_completed(tasks):
            try:
                result = await coro
            except Exception as e:
                print(f"Error processing dataset: {e}", flush=True)
                result = None
            completed += 1
            if result is not None:
                datasets.append(result)
                yield sse_event('partial', {
                    'latitude': lat,
                    'longitude': lon,
                    'dataset': result,
                })
            yield sse_event('progress', {
                'type': 'progress',
                'event': 'update',
                'ts': _now_iso(),
                'completed': completed,
                'total': total_files,
            })

        elapsed = time.time() - start_ts

        # Final progress event
        yield sse_event('progress', {
            'type': 'progress',
            'event': 'done',
            'ts': _now_iso(),
            'completed': completed,
            'total': total_files,
            'elapsed_seconds': round(elapsed, 2),
        })

        # Complete event with full result
        if datasets:
            complete_data = {
                'latitude': lat,
                'longitude': lon,
                'datasets': datasets,
                'progress': {
                    'started_utc': datetime.fromtimestamp(start_ts, tz=timezone.utc).isoformat(),
                    'finished_utc': _now_iso(),
                    'elapsed_seconds': round(elapsed, 2),
                    'tasks_total': total_files,
                    'tasks_completed': len(datasets),
                },
            }
            yield sse_event('complete', complete_data)
        else:
            yield sse_event('error', {
                'error': 'No data available at this location (point falls outside the Danube watershed mask)',
                'code': 'NO_DATA_AT_POINT',
                'lat': lat,
                'lon': lon,
                'coverage': COVERAGE_BBOX or None,
            })

    return StreamingResponse(
        generate_sse(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    )
