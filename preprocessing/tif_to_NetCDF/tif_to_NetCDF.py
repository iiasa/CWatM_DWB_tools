"""
Convert a modified GeoTIFF back to a CWatM-compatible NetCDF by using an
existing CWatM NetCDF parameter map as a template.

The script keeps the original NetCDF dimensions, coordinates, variable name,
variable attributes and global attributes, and only replaces the data array.

No GDAL/osgeo import is used. Raster reading is done with rasterio.

Example:
    python tif_to_cwatm_netcdf_template_nogdal.py --template ksat_3_1min.nc --tif morava_ksat_3_1min_x10.tif --output ksat_3_1min_modified.nc
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import shutil
import sys
from typing import Iterable


def check_required_packages() -> None:
    required = {
        "numpy": "numpy",
        "rasterio": "rasterio",
        "netCDF4": "netCDF4",
    }
    missing = [pkg for module, pkg in required.items() if importlib.util.find_spec(module) is None]
    if missing:
        print("ERROR: Missing required Python package(s):")
        for pkg in missing:
            print(f"  - {pkg}")
        print("\nInstall missing packages with:")
        print(f"  pip install {' '.join(missing)}")
        print("\nor, if you use Anaconda/Miniconda:")
        print(f"  conda install -c conda-forge {' '.join(missing)}")
        sys.exit(1)


check_required_packages()

import numpy as np
import rasterio
from netCDF4 import Dataset


def find_data_variable(ds: Dataset, explicit_name: str | None = None) -> str:
    """Find the NetCDF data variable to replace."""
    if explicit_name:
        if explicit_name not in ds.variables:
            raise RuntimeError(f"Variable '{explicit_name}' not found in template NetCDF.")
        return explicit_name

    coord_names = set(ds.dimensions.keys())
    candidates = []
    for name, var in ds.variables.items():
        if name in coord_names:
            continue
        if len(var.dimensions) == 2:
            candidates.append(name)

    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise RuntimeError("No 2D data variable found in template NetCDF.")
    raise RuntimeError(
        "More than one 2D data variable found in template NetCDF: "
        + ", ".join(candidates)
        + ". Use --variable to specify which one to replace."
    )


def variable_fill_value(var) -> float | None:
    """Return the NetCDF variable fill value if available."""
    for attr in ("_FillValue", "missing_value"):
        if hasattr(var, attr):
            value = getattr(var, attr)
            try:
                return float(np.asarray(value).ravel()[0])
            except Exception:
                return None
    return None


def replace_data(template_nc: str, tif_path: str, output_nc: str, variable: str | None, overwrite: bool) -> None:
    if os.path.exists(output_nc):
        if not overwrite:
            raise RuntimeError(f"Output file already exists: {output_nc}. Use --overwrite to replace it.")
        os.remove(output_nc)

    print(f"Reading template NetCDF: {template_nc}")
    with Dataset(template_nc, "r") as src:
        var_name = find_data_variable(src, variable)
        src_var = src.variables[var_name]
        dims = src_var.dimensions
        shape = src_var.shape
        fill_value = variable_fill_value(src_var)

    if len(shape) != 2:
        raise RuntimeError(f"Selected variable '{var_name}' is not 2D. Shape: {shape}")

    print(f"Template variable: {var_name}")
    print(f"Template dimensions: {dims}")
    print(f"Template shape: {shape[0]} rows × {shape[1]} columns")

    print(f"Reading GeoTIFF: {tif_path}")
    with rasterio.open(tif_path) as tif:
        data = tif.read(1).astype(np.float32)
        tif_nodata = tif.nodata
        print(f"GeoTIFF shape: {data.shape[0]} rows × {data.shape[1]} columns")
        print(f"GeoTIFF NoData: {tif_nodata}")

    if data.shape != shape:
        raise RuntimeError(
            "Raster dimensions do not match the template NetCDF variable.\n"
            f"Template: {shape}\n"
            f"GeoTIFF : {data.shape}"
        )

    # Convert TIFF NoData to the template NetCDF fill value if available; otherwise use NaN.
    if tif_nodata is not None:
        nodata_mask = np.isclose(data, tif_nodata) | ~np.isfinite(data)
    else:
        nodata_mask = ~np.isfinite(data)

    if fill_value is not None:
        data[nodata_mask] = fill_value
        print(f"NoData cells written as template fill value: {fill_value}")
    else:
        data[nodata_mask] = np.nan
        print("NoData cells written as NaN.")

    valid = data[~nodata_mask]
    if valid.size:
        print("Input data statistics, excluding NoData:")
        print(f"  min : {np.nanmin(valid):.6g}")
        print(f"  max : {np.nanmax(valid):.6g}")
        print(f"  mean: {np.nanmean(valid):.6g}")
    print(f"NoData cell count: {int(nodata_mask.sum())}")

    # Copy the full template file first, then replace only the selected variable values.
    shutil.copy2(template_nc, output_nc)
    print(f"Writing output NetCDF: {output_nc}")
    with Dataset(output_nc, "r+") as dst:
        dst.variables[var_name][:] = data
        dst.sync()

    print("Done.")


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Replace the data array in a CWatM NetCDF parameter map using values from a GeoTIFF."
    )
    parser.add_argument("--template", required=True, help="Original CWatM NetCDF parameter map used as template.")
    parser.add_argument("--tif", required=True, help="Modified GeoTIFF containing the new parameter values.")
    parser.add_argument("--output", required=True, help="Output NetCDF file.")
    parser.add_argument("--variable", default=None, help="Optional NetCDF variable name to replace. If omitted, the only 2D variable is used.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite output file if it already exists.")
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> None:
    args = parse_args(argv)
    replace_data(args.template, args.tif, args.output, args.variable, args.overwrite)


if __name__ == "__main__":
    main()
