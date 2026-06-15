#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# get_point_data.py

import sys
import argparse
import json
from pathlib import Path
import xarray as xr
import pandas as pd
import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import os
import time
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding='utf-8')

WORKERS = int(os.getenv('DASK_NUM_WORKERS', 0)) or (os.cpu_count() or 1)

# Lock for thread-safe stderr output
_stderr_lock = threading.Lock()

# Lock for serializing HDF5/NetCDF file opens (HDF5 is not thread-safe)
_hdf5_lock = threading.Lock()

_progress_state = {
    'total_files': 0,
    'completed': 0
}


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _progress(event, extra=None):
    payload = {
        'type': 'progress',
        'event': event,
        'ts': _now_iso(),
        'completed': _progress_state['completed'],
        'total': _progress_state['total_files']
    }
    if extra:
        payload.update(extra)
    with _stderr_lock:
        print(f"PROGRESS {json.dumps(payload, ensure_ascii=False)}", file=sys.stderr, flush=True)


def _partial(payload):
    try:
        with _stderr_lock:
            print(f"PARTIAL {json.dumps(payload, ensure_ascii=False)}", file=sys.stderr, flush=True)
    except Exception as exc:
        print(f"[PARTIAL] Failed to emit update: {exc}", file=sys.stderr, flush=True)


def find_nearest_pixel(ds, lat, lon):
    lat_names = ['lat', 'latitude', 'y']
    lon_names = ['lon', 'longitude', 'x']
    lat_dim = next((n for n in lat_names if n in ds.dims), None)
    lon_dim = next((n for n in lon_names if n in ds.dims), None)
    if not lat_dim or not lon_dim:
        return None, None
    lat_vals = ds[lat_dim].values
    lon_vals = ds[lon_dim].values
    lat_idx = np.abs(lat_vals - lat).argmin()
    lon_idx = np.abs(lon_vals - lon).argmin()
    return lat_idx, lon_idx


def process_single_nc_file(nc_file, base, lat, lon, idx, total_files):
    nc_path = base / nc_file
    if not nc_path.exists():
        print(f"[{idx}/{total_files}] Fajl ne postoji: {nc_file}", file=sys.stderr)
        return None

    print(f"[{idx}/{total_files}] Obrađujem: {nc_file}", file=sys.stderr)
    ds = None
    try:
        with _hdf5_lock:
            ds = xr.open_dataset(nc_path)

        time_names = ['time', 'Time', 'DATE', 'date']
        time_dim = next((n for n in time_names if n in ds.dims), None)
        if not time_dim:
            print(f"  Nema vremenske dimenzije u {nc_file}", file=sys.stderr)
            return None

        data_vars = [v for v in ds.data_vars]
        if not data_vars:
            print(f"  Nema data varijabli u {nc_file}", file=sys.stderr)
            return None

        var_name = data_vars[0]
        print(f"  Varijabla: {var_name}, vreme: {time_dim}", file=sys.stderr)

        if 'crs' in ds.variables:
            crs_info = ds['crs']
            print(f"  CRS: {crs_info.attrs.get('grid_mapping_name', 'N/A')}", file=sys.stderr)

        lat_idx, lon_idx = find_nearest_pixel(ds, lat, lon)
        if lat_idx is None or lon_idx is None:
            print(f"  Ne mogu da pronađem pixel za koordinate u {nc_file}", file=sys.stderr)
            return None

        lat_names = ['lat', 'latitude', 'y']
        lon_names = ['lon', 'longitude', 'x']
        lat_dim_name = next((n for n in lat_names if n in ds[var_name].dims), None)
        lon_dim_name = next((n for n in lon_names if n in ds[var_name].dims), None)

        lat_vals = ds[lat_dim_name].values
        lon_vals = ds[lon_dim_name].values
        print(f"  Lat: [{lat_vals.min():.2f}, {lat_vals.max():.2f}], Lon: [{lon_vals.min():.2f}, {lon_vals.max():.2f}]", file=sys.stderr)

        if lat_vals.min() < -90 or lat_vals.max() > 90:
            print(f"  UPOZORENJE: Latitude van WGS84 opsega!", file=sys.stderr)
        if lon_vals.min() < -180 or lon_vals.max() > 180:
            print(f"  UPOZORENJE: Longitude van WGS84 opsega!", file=sys.stderr)

        # Ekstrakcija jednog pixela - sa chunked loading ucitava samo potrebne podatke
        pixel_data = ds[var_name].isel({lat_dim_name: lat_idx, lon_dim_name: lon_idx})
        df = pixel_data.to_dataframe().reset_index()
        print(f"  DataFrame: {len(df)} redova", file=sys.stderr)

        df['time'] = pd.to_datetime(df[time_dim])
        if df['time'].dt.tz is not None:
            df['time'] = df['time'].dt.tz_localize(None)
        df = df.dropna(subset=['time'])

        if len(df) == 0:
            print(f"  Nema podataka za {nc_file}", file=sys.stderr)
            return None

        min_date = df['time'].min()
        max_date = df['time'].max()
        print(f"  Period: {min_date.strftime('%Y-%m')} do {max_date.strftime('%Y-%m')}", file=sys.stderr)

        # Vektorizovana konverzija - bez iterrows petlje
        df_valid = df[['time', var_name]].copy()
        df_valid[var_name] = pd.to_numeric(df_valid[var_name], errors='coerce')
        df_valid = df_valid.dropna(subset=[var_name])
        df_valid = df_valid[np.isfinite(df_valid[var_name])]
        nan_count = len(df) - len(df_valid)

        if df_valid.empty:
            print(f"  Nema validnih podataka (sve NaN)", file=sys.stderr)
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

        result = {
            'variable_name': clean_name,
            'file_name': nc_file,
            'data_points': data_points,
            'total_points': len(data_points)
        }
        print(f"  Varijabla: {clean_name}, tačaka: {len(data_points)}, NaN: {nan_count}", file=sys.stderr)
        return result

    except Exception as e:
        print(f"  Greška pri obradi {nc_file}: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return None
    finally:
        if ds is not None:
            try:
                ds.close()
            except Exception:
                pass
        with _stderr_lock:
            _progress_state['completed'] += 1
        _progress('update')


def get_pixel_data(lat, lon):
    data_root = Path(os.environ.get("DATA_DIR", str(Path(__file__).parent.parent.parent / "data")))
    base = data_root / "nc" / "month"
    if not base.exists():
        print(f"Folder ne postoji: {base}", file=sys.stderr)
        return None

    nc_files = [
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
        "SnowFraction_monthavg.nc"
    ]

    print(f"\n{'='*60}", file=sys.stderr)
    print(f"OBRADA MESECNIH PIXEL PODATAKA (DASK PARALELIZACIJA)", file=sys.stderr)
    print(f"Koordinate: ({lat:.4f}, {lon:.4f})", file=sys.stderr)
    print(f"Fajlova za obradu: {len(nc_files)}", file=sys.stderr)
    print(f"{'='*60}\n", file=sys.stderr)

    start_ts = time.time()
    _progress_state['total_files'] = len(nc_files)
    _progress_state['completed'] = 0
    _progress('start', extra={'workers': WORKERS})

    datasets = []

    # Discharge fajl se obradjuje prvi sinhrono za brz PARTIAL update
    discharge_file = "danube_discharge_monthly.nc"
    remaining_files = list(nc_files)

    if discharge_file in remaining_files:
        discharge_index = remaining_files.index(discharge_file) + 1
        discharge_result = process_single_nc_file(discharge_file, base, lat, lon, discharge_index, len(nc_files))
        remaining_files.pop(discharge_index - 1)
        if discharge_result is not None:
            datasets.append(discharge_result)
            _partial({
                'latitude': lat,
                'longitude': lon,
                'dataset': discharge_result
            })

    # Ostali fajlovi se obradjuju paralelno sa ThreadPoolExecutor (I/O-bound operacije)
    # Koristi as_completed da emituje PARTIAL za svaki fajl cim zavrsi
    start_idx = len(nc_files) - len(remaining_files) + 1
    if remaining_files:
        print(f"Paralelno procesiranje {len(remaining_files)} fajlova...\n", file=sys.stderr)
        with ThreadPoolExecutor(max_workers=WORKERS) as executor:
            futures = {
                executor.submit(process_single_nc_file, nc_file, base, lat, lon, idx, len(nc_files)): nc_file
                for idx, nc_file in enumerate(remaining_files, start_idx)
            }
            for future in as_completed(futures):
                result = future.result()
                if result is not None:
                    datasets.append(result)
                    _partial({
                        'latitude': lat,
                        'longitude': lon,
                        'dataset': result
                    })

    print(f"\n{'='*60}", file=sys.stderr)
    if not datasets:
        print("Nema podataka za zadatu lokaciju", file=sys.stderr)
        print(f"{'='*60}\n", file=sys.stderr)
        elapsed = time.time() - start_ts
        _progress('done', extra={'elapsed_seconds': round(elapsed, 2)})
        return None

    elapsed = time.time() - start_ts
    finished_utc = _now_iso()
    _progress('done', extra={'elapsed_seconds': round(elapsed, 2)})

    result = {
        'latitude': lat,
        'longitude': lon,
        'datasets': datasets,
        'progress': {
            'started_utc': datetime.fromtimestamp(start_ts, tz=timezone.utc).isoformat(),
            'finished_utc': finished_utc,
            'elapsed_seconds': round(elapsed, 2),
            'tasks_total': _progress_state['total_files'],
            'tasks_completed': len(datasets)
        }
    }

    total_points = sum(ds['total_points'] for ds in datasets)
    print(f"Pripremljeno {len(datasets)}/{len(nc_files)} dataset-a, ukupno tačaka: {total_points:,}", file=sys.stderr)
    print(f"Vreme: {elapsed:.2f}s", file=sys.stderr)
    print(f"{'='*60}\n", file=sys.stderr)
    return result


def main():
    ap = argparse.ArgumentParser(description='Dobij podatke iz NetCDF fajlova za zadatu lokaciju')
    ap.add_argument("--lat", type=float, required=True, help="Geografska širina (latitude)")
    ap.add_argument("--lon", type=float, required=True, help="Geografska dužina (longitude)")
    args = ap.parse_args()

    print(f"\nMESECNI PIXEL DATA EXTRACTION", file=sys.stderr)
    print(f"Lokacija: ({args.lat:.6f}, {args.lon:.6f})", file=sys.stderr)

    data = get_pixel_data(args.lat, args.lon)

    if data:
        json_output = json.dumps(data, ensure_ascii=False)
        print(f"JSON velicina: {len(json_output):,} karaktera", file=sys.stderr)
        print(json_output)
    else:
        print("null")


if __name__ == "__main__":
    main()
