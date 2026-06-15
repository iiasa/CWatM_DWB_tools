#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# 02_daily_to_monthly.py
#
# Based on /Users/lang/Documents/DWB Scripts/dnevni_mesecni.py.
# The ONLY behavioural change is:
#   resample(time="MS").median(...)  →  resample(time="MS").mean(...)
# Reason: monthly median collapses intermittent fluxes (Rain, Snow,
# SnowMelt, IceMelt) to ~0 because most days are dry — see
# dwb-backend/docs/DATA_QUALITY.md. Mean keeps CWatM's native m/day
# convention and produces hydrologically correct monthly values.
#
# Also adds:
#   - explicit `units = "m"` for runoff/totalET_WB (missing in raw daily)
#   - preserves `units` attribute on every output variable
#
# Everything else (file naming, time-axis rewrite to YYYY-MM strings
# starting 1990-01, year/month coords, zlib level 4 encoding) matches
# the original so the existing parquet schema is preserved.

# Ulaz: svi *.nc fajlovi u INPUT_DIR koji završavaju sa "daily.nc"
# Izlaz: za svaki fajl generišem "monthly" varijantu u OUTPUT_DIR
# Agregacija: mesečna sredina (mean) po pikselu
# "time" zapisujem kao string "YYYY-MM", ali indeks počinje od "1990-01"
# uz pomoćne koordinate "year" i "month"

import os
import re
import sys
import numpy as np
import pandas as pd

# Podesi putanje
INPUT_DIR  = "/Users/lang/Documents/DWB NEW Data/danube_daily"
OUTPUT_DIR = "/Users/lang/Documents/DWB NEW Data/nc/month"

# Opcionalno ograniči varijable po imenu, npr ["runoff"]
VAR_WHITELIST = []  # ostavi prazno za sve numeričke sa dimenzijom "time"

# Veličina čanka po vremenu
# Smanjeno sa originalnih 3000 — na 8 GB Mac-u, 3000*505*1069*4 ≈ 6.5 GB
# po čanku što gura preko fizičkog RAM-a i izaziva tihi kill. 90 dana
# (~3 meseca) ≈ 195 MB po čanku, bezbedno za resample agregaciju.
CHUNK_TIME = 90

# Varijable kojima nedostaje units u sirovim dnevnim fajlovima.
# CWatM-ova konvencija: m/day. Stempluj eksplicitno.
UNITS_OVERRIDES = {
    "runoff": "m",
    "totalET_WB": "m",
}

def vars_to_process_from(ds):
    if VAR_WHITELIST:
        missing = [v for v in VAR_WHITELIST if v not in ds.data_vars]
        if missing:
            raise ValueError(f"Nedostaju varijable: {missing}")
        return VAR_WHITELIST
    return [
        v for v, da in ds.data_vars.items()
        if ("time" in da.dims) and np.issubdtype(da.dtype, np.number)
    ]

def make_output_name(basename):
    out = re.sub(r'(?i)daily(?=\.nc$)', 'monthly', basename)
    if out == basename:
        out = re.sub(r'\.nc$', '_monthly.nc', basename, flags=re.IGNORECASE)
    return out

def process_one(nc_path):
    import xarray as xr

    print(f"[INFO] Obrada: {nc_path}")
    ds = xr.open_dataset(
        nc_path,
        engine="netcdf4",
        chunks={"time": CHUNK_TIME},
        decode_times=True,
        mask_and_scale=True,
    )

    if "time" not in ds.dims:
        ds.close()
        raise ValueError("Nema dimenzije 'time'")

    vlist = vars_to_process_from(ds)
    if not vlist:
        ds.close()
        raise ValueError("Nema numeričkih varijabli sa dimenzijom 'time'")

    # Sačuvaj originalne atribute (uključujući units) PRE bilo kakvog .where
    src_var_attrs = {v: dict(ds[v].attrs) for v in vlist}

    ds = ds[vlist]

    # Očisti nenumeričke vrednosti
    for v in vlist:
        ds[v] = ds[v].where(np.isfinite(ds[v]))

    # === FIX: mesečna SREDNJA VREDNOST (mean) po pikselu (MS = početak meseca) ===
    ds_month = ds.resample(time="MS").mean(skipna=True, keep_attrs=True)

    # GENERIŠI TIME OD 1990-01 SA ISTIM BROJEM KORAKA
    n = ds_month.sizes.get("time", 0)
    if n == 0:
        ds.close()
        raise ValueError("Nema vremenskih koraka posle agregacije")

    start = pd.Timestamp("1990-01-01")
    time_seq = pd.date_range(start=start, periods=n, freq="MS")
    time_str = np.array([f"{t.year:04d}-{t.month:02d}" for t in time_seq], dtype=object)
    years_arr = time_seq.year.astype(np.int32).to_numpy()
    months_arr = time_seq.month.astype(np.int16).astype(np.int8)

    ds_month = ds_month.assign_coords(time=("time", time_str))
    ds_month = ds_month.assign_coords(year=("time", years_arr), month=("time", months_arr))

    # Atributi
    note = "Monthly mean from daily inputs. time forced to consecutive YYYY-MM starting at 1990-01."
    ds_month.attrs = dict(ds.attrs) if ds.attrs else {}
    ds_month.attrs["aggregation"] = note
    ds_month.attrs["source_file"] = nc_path
    for v in vlist:
        attrs = dict(src_var_attrs.get(v) or {})
        attrs["aggregation"] = "monthly mean"
        # Stamp units ako nedostaje u sirovim podacima (runoff/totalET_WB).
        if not attrs.get("units") and v in UNITS_OVERRIDES:
            attrs["units"] = UNITS_OVERRIDES[v]
        ds_month[v].attrs = attrs

    # Encoding (isto kao u originalu)
    encoding = {}
    for v in vlist:
        encoding[v] = {"zlib": True, "complevel": 4}
    for coord in ds_month.coords:
        if coord in ("time",):  # time je string
            continue
        if np.issubdtype(ds_month[coord].dtype, np.number):
            encoding[coord] = {"zlib": True, "complevel": 4}
    encoding["time"] = {"dtype": str}
    encoding["year"] = {"zlib": True, "complevel": 4}
    encoding["month"] = {"zlib": True, "complevel": 4}

    # Izlazno ime
    base = os.path.basename(nc_path)
    out_name = make_output_name(base)
    out_path = os.path.join(OUTPUT_DIR, out_name)

    ds_month.to_netcdf(out_path, engine="netcdf4", encoding=encoding, format="NETCDF4")

    ds.close()
    print(f"[OK] Sačuvano: {out_path}")
    return out_path, vlist

def main():
    import glob
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    nc_files = glob.glob(os.path.join(INPUT_DIR, "*.nc"))

    if not nc_files:
        print("[WARN] Nema .nc fajlova u INPUT_DIR")
        return

    processed = 0
    for fp in nc_files:
        base = os.path.basename(fp).lower()
        if base.endswith("monthly.nc"):
            continue
        if not base.endswith("daily.nc"):
            continue
        try:
            out_path, vlist = process_one(fp)
            processed += 1
        except Exception as e:
            print(f"[ERR] Preskačem {fp} zbog greške: {e}")

    print(f"[INFO] Gotovo. Obradio sam {processed} fajlova.")

if __name__ == "__main__":
    try:
        import xarray as xr  # provera zavisnosti
    except ImportError:
        print("Instaliraj: pip install xarray netcdf4 dask pandas", file=sys.stderr)
        sys.exit(1)
    main()
