#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# seed_lulc_cog.sh — Build the static Land Use / Land Cover (LULC) Cloud
# Optimized GeoTIFF for the Danube basin from Copernicus Global Land Cover
# (CGLS-LC100 Collection 3, epoch 2019, 100 m) and place it where the
# cog-seeder / TiTiler stack reads the other rasters.
#
# Like the DEM (see seed_dem_cog.sh) the LULC layer is STATIC: it produces ONE
# file, data/tif/cog/lulc/lulc.cog.tif (no per-month timesteps). It represents a
# single fixed epoch (2019, the latest in CGLS-LC100 v3), so the time slider
# leaves it unchanged.
#
# CATEGORICAL DATA — this is the key difference from every other layer. The
# pixels are discrete integer class codes (Shrubs=20, Cropland=40, Urban=50,
# water=80, forests=111..126, ...), NOT a continuous quantity. Therefore the
# warp and the overviews use NEAREST-NEIGHBOUR resampling and the data stays
# Byte: averaging would invent class codes that do not exist. "All original
# values" are preserved exactly.
#
# The map is clipped to the actual catchment using the dissolved subbasin
# outline (data/subbasins/basin_outline.geojson) as a cutline, so only basin
# pixels are kept. If that outline is missing the script falls back to a plain
# bbox clip.
#
# Source : Copernicus Global Land Service — CGLS-LC100 Collection 3, 2019
#          Discrete-Classification-map, EPSG:4326, single global GeoTIFF (1.7 GB)
#          Zenodo record 3939050 (DOI 10.5281/zenodo.3939050)
# License: CC-BY 4.0 — see docs/lulc-data-source.md (AC6).
#          © Copernicus Global Land Service (CGLS-LC100 v3),
#          provided by the European Commission Joint Research Centre (JRC).
#
# Reproducible: needs only Docker + curl. The official OSGeo GDAL image provides
# gdalwarp / gdalinfo with the COG driver. By default the full global source is
# downloaded once (resumable) and clipped locally. Set REMOTE=1 to instead read
# only the basin window straight from the remote COG via /vsicurl (no 1.7 GB
# download — the global file is itself a COG, so windowed reads work).
#
# Usage:
#   ./seed_lulc_cog.sh                # download (if needed) + build lulc.cog.tif
#   FORCE=1 ./seed_lulc_cog.sh        # rebuild even if the COG exists
#   REMOTE=1 ./seed_lulc_cog.sh       # windowed /vsicurl read, skip the 1.7 GB download
#   CLIP=bbox ./seed_lulc_cog.sh      # force plain bbox clip (ignore cutline)
# Then publish to the TiTiler volume:
#   (cd .. && docker compose --env-file .env.docker.local \
#      -f docker-compose.cog-seed.yml run --rm cog-seeder)
# -----------------------------------------------------------------------------
set -euo pipefail

# --- Danube basin bounding box (WGS84 / EPSG:4326) ---------------------------
# Matches the dissolved subbasin outline extent (lon 8.15-28.73, lat 42.08-50.25),
# padded out to whole degrees. Used for the bbox fallback and to bound the warp.
WEST=8.0
SOUTH=42.0
EAST=29.0
NORTH=50.5

# --- Paths -------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUT_DIR="${REPO_ROOT}/data/tif/cog/lulc"
OUT_FILE="${OUT_DIR}/lulc.cog.tif"
WORK_DIR="${OUT_DIR}/.work"
SRC_FILE="${WORK_DIR}/lulc_global_2019.tif"
CUTLINE="${REPO_ROOT}/data/subbasins/basin_outline.geojson"

# --- Remote source -----------------------------------------------------------
# Single global Discrete-Classification-map GeoTIFF for epoch 2019 (~1.7 GB).
SRC_URL="https://zenodo.org/records/3939050/files/PROBAV_LC100_global_v3.0.1_2019-nrt_Discrete-Classification-map_EPSG-4326.tif?download=1"
GDAL_IMAGE="${GDAL_IMAGE:-ghcr.io/osgeo/gdal:ubuntu-small-latest}"

if [[ -f "${OUT_FILE}" && "${FORCE:-0}" != "1" ]]; then
  echo "LULC COG already exists: ${OUT_FILE}"
  echo "Set FORCE=1 to rebuild."
  exit 0
fi

# --- Decide clip mode: cutline (default) vs bbox -----------------------------
USE_CUTLINE=1
if [[ "${CLIP:-cutline}" == "bbox" ]]; then
  USE_CUTLINE=0
  echo "CLIP=bbox set -> plain bounding-box clip."
elif [[ ! -f "${CUTLINE}" ]]; then
  USE_CUTLINE=0
  echo "WARNING: cutline not found (${CUTLINE}) -> falling back to bbox clip." >&2
else
  echo "Clipping to catchment cutline: ${CUTLINE}"
fi

mkdir -p "${WORK_DIR}"

# --- 1. Obtain the source raster ---------------------------------------------
# Either the full global file (default, resumable) or a remote /vsicurl handle.
if [[ "${REMOTE:-0}" == "1" ]]; then
  SRC_FOR_WARP="/vsicurl/${SRC_URL}"
  echo "REMOTE=1 -> windowed read from ${SRC_URL%%\?*}"
else
  if [[ -f "${SRC_FILE}" && "${FORCE:-0}" != "1" ]]; then
    echo "Source already downloaded: ${SRC_FILE} ($(du -h "${SRC_FILE}" | cut -f1))"
  else
    echo "Downloading global CGLS-LC100 2019 discrete map (~1.7 GB, resumable)..."
    # -C - resumes a partial download; -L follows redirects; --fail on HTTP errors.
    curl -L --fail -C - -o "${SRC_FILE}" "${SRC_URL}"
  fi
  SRC_FOR_WARP="/work/$(basename "${SRC_FILE}")"
fi

# Stage the cutline inside the work dir so it is visible in the container mount.
CUT_ARGS=""
if [[ "${USE_CUTLINE}" -eq 1 ]]; then
  cp "${CUTLINE}" "${WORK_DIR}/cutline.geojson"
  CUT_ARGS='-cutline /work/cutline.geojson -crop_to_cutline -cutline_srs EPSG:4326'
fi

# --- 2. Clip/reproject -> COG, all inside the GDAL container ------------------
# Categorical-safe settings: NEAREST resampling on the warp AND the overviews,
# Byte output, no predictor. The COG driver builds the overview pyramid
# automatically so tiles stay valid at every zoom (2-19, AC2). Outside-cutline
# pixels and the source "unknown/no-data" class (0) become dstnodata 255, which
# the colormap renders transparent.
echo "Building LULC COG via ${GDAL_IMAGE} ..."
docker run --rm \
  -v "${OUT_DIR}:/out" \
  -v "${WORK_DIR}:/work" \
  -e GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR \
  -e CPL_VSIL_CURL_ALLOWED_EXTENSIONS=.tif \
  -e VSI_CACHE=TRUE \
  -e GDAL_HTTP_MULTIPLEX=YES \
  "${GDAL_IMAGE}" bash -c '
    set -euo pipefail
    gdalwarp \
      -of COG \
      -t_srs EPSG:4326 \
      -te '"${WEST}"' '"${SOUTH}"' '"${EAST}"' '"${NORTH}"' \
      '"${CUT_ARGS}"' \
      -r near \
      -ot Byte \
      -srcnodata 0 \
      -dstnodata 255 \
      -co COMPRESS=ZSTD \
      -co PREDICTOR=NO \
      -co BLOCKSIZE=512 \
      -co OVERVIEWS=AUTO \
      -co OVERVIEW_RESAMPLING=NEAREST \
      -co NUM_THREADS=ALL_CPUS \
      -co BIGTIFF=YES \
      -overwrite \
      '"${SRC_FOR_WARP}"' /out/lulc.cog.tif

    echo "--- gdalinfo (summary) ---"
    gdalinfo /out/lulc.cog.tif | grep -iE "Size is|Type=|NoData|Block=|Overviews|Compression|Pixel Size|Upper Left|Lower Right" || true
    echo "--- discrete class values present in the basin ---"
    python3 -c "
import numpy as np
from osgeo import gdal
b = gdal.Open(\"/out/lulc.cog.tif\").GetRasterBand(1)
ov = b.GetOverview(b.GetOverviewCount()-1)  # smallest overview = fast scan
vals = sorted(int(v) for v in np.unique(ov.ReadAsArray()))
print(\"  values:\", \", \".join(str(v) for v in vals if v != 255), \"(255 = nodata/outside basin)\")
" || true
  '

# --- 3. Report & clean up ----------------------------------------------------
echo
echo "Done: ${OUT_FILE}  ($(du -h "${OUT_FILE}" | cut -f1))"
echo "Next: seed the Docker volume so TiTiler can serve it:"
echo "  (cd ${REPO_ROOT}/dwb-backend && \\"
echo "   docker compose --env-file .env.docker.local \\"
echo "     -f docker-compose.cog-seed.yml run --rm cog-seeder)"
# Keep the downloaded source in .work so re-runs do not re-fetch 1.7 GB.
# Remove only the staged cutline/vrt scratch; pass FORCE=1 to refetch the source.
rm -f "${WORK_DIR}/cutline.geojson"
