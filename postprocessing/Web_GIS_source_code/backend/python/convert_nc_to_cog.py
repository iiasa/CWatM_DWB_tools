#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Convert monthly NetCDF files to Cloud Optimized GeoTIFF (COG) files for TiTiler.

Each NetCDF file contains a single variable with monthly timesteps. This script
extracts each timestep as a separate COG file, suitable for on-the-fly tile
serving via TiTiler.

Usage:
  python convert_nc_to_cog.py --nc-dir G:/DWB/data/nc/month --output G:/DWB/data/tif/cog
  python convert_nc_to_cog.py --variable discharge --skip-existing
  python convert_nc_to_cog.py --variable rain --start-time 2010-01 --end-time 2015-12
"""

import argparse
import sys
import time as time_module
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_bounds
import xarray as xr

# Mapping: variable key -> NetCDF filename (same as generate_tiles.py)
VARIABLE_MAP = {
    'discharge':    'danube_discharge_monthly.nc',
    'etref':        'danube_ETRef_monthly.nc',
    'icemelt':      'danube_IceMelt_monthly.nc',
    'rain':         'danube_Rain_monthly.nc',
    'runoff':       'danube_runoff_monthly.nc',
    'snow':         'danube_Snow_monthly.nc',
    'snowfraction': 'danube_SnowFraction_monthly.nc',
    'snowmelt':     'danube_SnowMelt_monthly.nc',
    'totalet':      'danube_totalET_WB_monthly.nc',
    'tws':          'danube_tws_monthly.nc',
}

# COG profile matching existing IceMelt daily COGs
COG_PROFILE = {
    'driver': 'GTiff',
    'dtype': 'float32',
    'nodata': -9999.0,
    'count': 1,
    'crs': 'EPSG:4326',
    'tiled': True,
    'blockxsize': 512,
    'blockysize': 512,
    'compress': 'zstd',
}

# Overview levels for multi-resolution access
OVERVIEW_LEVELS = [2, 4, 8]


def detect_dimensions(ds):
    """Detect lat, lon, and time dimension names in the dataset."""
    lat_names = ['lat', 'latitude', 'y']
    lon_names = ['lon', 'longitude', 'x']
    time_names = ['time', 'Time', 'DATE', 'date']

    lat_dim = next((n for n in lat_names if n in ds.dims), None)
    lon_dim = next((n for n in lon_names if n in ds.dims), None)
    time_dim = next((n for n in time_names if n in ds.dims), None)

    return lat_dim, lon_dim, time_dim


def get_data_variable(ds):
    """Get the first non-coordinate data variable from the dataset."""
    data_vars = [v for v in ds.data_vars if v != 'crs']
    return data_vars[0] if data_vars else None


def time_to_month_key(time_val):
    """Convert a time value to YYYY-MM string format."""
    import pandas as pd
    ts = pd.Timestamp(str(time_val))
    return ts.strftime('%Y-%m')


def write_cog(data, lat, lon, output_path):
    """Write a 2D numpy array as a Cloud Optimized GeoTIFF."""
    height, width = data.shape

    lat_vals = np.asarray(lat)
    lon_vals = np.asarray(lon)

    # Ensure latitude is north-to-south (descending) for raster convention
    if lat_vals[0] < lat_vals[-1]:
        lat_vals = lat_vals[::-1]
        data = data[::-1, :]

    # Compute bounds from pixel centers (half-pixel expansion)
    lat_res = abs(lat_vals[1] - lat_vals[0]) if len(lat_vals) > 1 else 0.01
    lon_res = abs(lon_vals[1] - lon_vals[0]) if len(lon_vals) > 1 else 0.01

    west = float(lon_vals.min()) - lon_res / 2
    east = float(lon_vals.max()) + lon_res / 2
    south = float(lat_vals.min()) - lat_res / 2
    north = float(lat_vals.max()) + lat_res / 2

    transform = from_bounds(west, south, east, north, width, height)

    profile = {
        **COG_PROFILE,
        'width': width,
        'height': height,
        'transform': transform,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Replace NaN with nodata value
    data_out = np.where(np.isnan(data), COG_PROFILE['nodata'], data).astype('float32')

    with rasterio.open(str(output_path), 'w', **profile) as dst:
        dst.write(data_out, 1)
        # Build overviews for efficient multi-zoom access
        dst.build_overviews(OVERVIEW_LEVELS, rasterio.enums.Resampling.average)
        dst.update_tags(ns='rio_overview', resampling='average')


def convert_variable(nc_dir, output_dir, variable, skip_existing=False,
                     start_time=None, end_time=None):
    """Convert all timesteps for a single variable from NetCDF to COG."""
    nc_filename = VARIABLE_MAP[variable]
    nc_path = Path(nc_dir) / nc_filename

    if not nc_path.exists():
        print(f"  WARNING: {nc_path} not found, skipping {variable}")
        return 0

    ds = xr.open_dataset(str(nc_path))
    lat_dim, lon_dim, time_dim = detect_dimensions(ds)

    if not all([lat_dim, lon_dim, time_dim]):
        print(f"  WARNING: Could not detect dimensions for {variable}, skipping")
        ds.close()
        return 0

    var_name = get_data_variable(ds)
    if not var_name:
        print(f"  WARNING: No data variable found in {nc_filename}, skipping")
        ds.close()
        return 0

    lat = ds[lat_dim].values
    lon = ds[lon_dim].values
    time_vals = ds[time_dim].values
    var_dir = Path(output_dir) / variable

    converted = 0
    total = len(time_vals)

    for i, t in enumerate(time_vals):
        month_key = time_to_month_key(t)

        # Filter by time range if specified
        if start_time and month_key < start_time:
            continue
        if end_time and month_key > end_time:
            continue

        output_path = var_dir / f"{variable}_{month_key}.cog.tif"

        if skip_existing and output_path.exists():
            continue

        # Extract 2D slice for this timestep
        data = ds[var_name].isel({time_dim: i}).values

        write_cog(data, lat, lon, output_path)
        converted += 1

        if converted % 50 == 0 or converted == 1:
            print(f"  {variable}: {converted} files written ({i + 1}/{total} timesteps processed)")

    ds.close()
    return converted


def main():
    parser = argparse.ArgumentParser(
        description='Convert monthly NetCDF files to Cloud Optimized GeoTIFF (COG) for TiTiler'
    )
    parser.add_argument('--nc-dir', default='G:/DWB/data/nc/month',
                        help='Directory containing NetCDF monthly files')
    parser.add_argument('--output', default='G:/DWB/data/tif/cog',
                        help='Output directory for COG files')
    parser.add_argument('--variable', choices=list(VARIABLE_MAP.keys()),
                        help='Convert only this variable (default: all)')
    parser.add_argument('--skip-existing', action='store_true',
                        help='Skip files that already exist')
    parser.add_argument('--start-time', help='Start time filter (YYYY-MM)')
    parser.add_argument('--end-time', help='End time filter (YYYY-MM)')

    args = parser.parse_args()

    variables = [args.variable] if args.variable else list(VARIABLE_MAP.keys())
    start = time_module.time()

    print(f"Converting NetCDF -> COG")
    print(f"  Source: {args.nc_dir}")
    print(f"  Output: {args.output}")
    print(f"  Variables: {', '.join(variables)}")
    if args.skip_existing:
        print(f"  Skipping existing files")
    if args.start_time or args.end_time:
        print(f"  Time range: {args.start_time or 'start'} to {args.end_time or 'end'}")
    print()

    total_converted = 0
    for variable in variables:
        print(f"Processing: {variable}")
        count = convert_variable(
            args.nc_dir, args.output, variable,
            skip_existing=args.skip_existing,
            start_time=args.start_time,
            end_time=args.end_time,
        )
        total_converted += count
        print(f"  {variable}: {count} COG files written")
        print()

    elapsed = time_module.time() - start
    print(f"Done! {total_converted} total COG files in {elapsed:.1f}s")


if __name__ == '__main__':
    main()
