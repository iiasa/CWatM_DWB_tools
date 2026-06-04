"""
Custom TiTiler application for DWB project.

Registers 10 DWB-specific colormaps (parsed from GDAL .txt files) as named
colormaps so tile URLs can use short `colormap_name=dwb_discharge` instead of
encoding full colormap JSON in query parameters.
"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from rio_tiler.colormap import ColorMaps
from titiler.core.dependencies import create_colormap_dependency
from titiler.core.factory import TilerFactory
from titiler.core.errors import DEFAULT_STATUS_CODES, add_exception_handlers

# DWB variable names (must match backend VALID_VARIABLES)
# 'dem' and 'lulc' are static (time-independent) layers served from a single COG.
# 'lulc' is categorical: lulc.txt has one breakpoint per discrete class value, so
# build_interval_colormap maps each class to a solid color (pixels are exact ints).
DWB_VARIABLES = [
    'discharge', 'etref', 'icemelt', 'rain', 'runoff',
    'snow', 'snowfraction', 'snowmelt', 'totalet', 'tws',
    'dem', 'lulc',
]

# Colormap directory (mounted via Docker or local path)
COLORMAP_DIR = os.environ.get(
    'DWB_COLORMAP_DIR',
    str(Path(__file__).parent / 'colormaps')
)


def parse_gdal_colormap(filepath):
    """Parse a GDAL color-relief .txt file into breakpoint entries."""
    entries = []

    with open(filepath) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split()
            if len(parts) < 4:
                continue
            if parts[0].lower() == 'nv':
                continue

            val = float(parts[0])
            r, g, b = int(parts[1]), int(parts[2]), int(parts[3])
            a = int(parts[4]) if len(parts) > 4 else 255
            entries.append((val, r, g, b, a))

    entries.sort(key=lambda x: x[0])
    return entries


def build_interval_colormap(entries):
    """
    Convert GDAL colormap breakpoints into rio-tiler interval colormap format.

    Returns a list of ((min, max), (r, g, b, a)) tuples.
    """
    intervals = []

    for i in range(len(entries) - 1):
        val_low = entries[i][0]
        val_high = entries[i + 1][0]
        r, g, b, a = entries[i][1], entries[i][2], entries[i][3], entries[i][4]
        intervals.append(((val_low, val_high), (r, g, b, a)))

    # Extend last entry to a very large value
    if entries:
        last = entries[-1]
        intervals.append(((last[0], last[0] * 100), (last[1], last[2], last[3], last[4])))

    return intervals


def load_dwb_colormaps():
    """Load all DWB colormaps from GDAL .txt files."""
    colormaps = {}

    for variable in DWB_VARIABLES:
        filepath = Path(COLORMAP_DIR) / f'{variable}.txt'
        if not filepath.exists():
            print(f"WARNING: Colormap file not found: {filepath}")
            continue

        entries = parse_gdal_colormap(str(filepath))
        if not entries:
            print(f"WARNING: No valid entries in colormap: {filepath}")
            continue

        colormaps[f'dwb_{variable}'] = build_interval_colormap(entries)
        print(f"Registered colormap: dwb_{variable} ({len(entries)} breakpoints)")

    return colormaps


# Load colormaps at module level
dwb_colormaps = load_dwb_colormaps()

# Create custom ColorMaps instance with DWB colormaps registered
cmap = ColorMaps(data=dwb_colormaps)

# Build the FastAPI application
app = FastAPI(
    title="DWB TiTiler",
    description="On-the-fly raster tile server for Danube Water Balance data",
    version="1.0.0",
)

# CORS middleware
cors_origins = os.environ.get('TITILER_API_CORS_ORIGINS', '*')
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins.split(','),
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Create COG tiler with custom colormaps
cog = TilerFactory(
    colormap_dependency=create_colormap_dependency(cmap),
    router_prefix="/cog",
)
app.include_router(cog.router, prefix="/cog", tags=["COG"])

# Add exception handlers
add_exception_handlers(app, DEFAULT_STATUS_CODES)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "colormaps": list(dwb_colormaps.keys()),
    }


@app.get("/colormaps")
async def list_colormaps():
    """List all available DWB colormaps."""
    return {
        "colormaps": list(dwb_colormaps.keys()),
        "count": len(dwb_colormaps),
    }
