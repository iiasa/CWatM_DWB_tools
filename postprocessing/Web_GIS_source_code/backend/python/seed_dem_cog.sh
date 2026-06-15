#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# seed_dem_cog.sh — Build the static DEM Cloud Optimized GeoTIFF for the
# Danube basin from Copernicus DEM GLO-30 (~30 m) and place it where the
# cog-seeder / TiTiler stack reads the other rasters.
#
# Unlike the time-series layers (see convert_nc_to_cog.py), the DEM is STATIC:
# it produces ONE file, data/tif/cog/dem/dem.cog.tif (no per-month timesteps).
#
# The DEM is clipped to the actual catchment using the dissolved subbasin
# outline (data/subbasins/basin_outline.geojson) as a cutline, so only basin
# pixels are kept (~half the bounding box). If that outline is missing the
# script falls back to a plain bbox clip.
#
# Source : Copernicus DEM GLO-30, public AWS Open Data bucket
#          s3://copernicus-dem-30m  (https endpoint, no credentials needed)
# Heights: orthometric, EGM2008 geoid — i.e. metres above sea level (AC3).
# License: see docs/dem-data-source.md (AC7).
#
# Reproducible: needs only Docker + curl. The official OSGeo GDAL image
# provides gdalbuildvrt / gdalwarp / gdal_translate with the COG driver, and
# reads the remote tiles via /vsicurl/ — so no GDAL install on the host and no
# bulk tile downloads; only the final COG is written to disk.
#
# Regenerating the cutline (only if subbasin geometry changes; needs dwb-db up):
#   printf "%s" "SELECT json_build_object('type','FeatureCollection','features',\
#     json_build_array(json_build_object('type','Feature','properties',\
#     json_build_object('name','Danube basin outline'),'geometry',\
#     ST_AsGeoJSON(g,6)::json))) FROM (SELECT ST_Union(ST_MakeValid(\"geom\")) \
#     AS g FROM subbasins) u;" \
#     | docker exec -i dwb-db psql -U postgres -d DWB -t -A \
#     > ../../data/subbasins/basin_outline.geojson
#
# Usage:
#   ./seed_dem_cog.sh                 # build dem.cog.tif (skips if it exists)
#   FORCE=1 ./seed_dem_cog.sh         # rebuild even if it exists
#   CLIP=bbox ./seed_dem_cog.sh       # force plain bbox clip (ignore cutline)
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

# Integer 1° tile ranges (lower-left corner) that cover the bbox.
LON_MIN=8;  LON_MAX=28     # tiles E008 .. E028
LAT_MIN=42; LAT_MAX=50     # tiles N42  .. N50

# --- Paths -------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUT_DIR="${REPO_ROOT}/data/tif/cog/dem"
OUT_FILE="${OUT_DIR}/dem.cog.tif"
WORK_DIR="${OUT_DIR}/.work"
LIST_FILE="${WORK_DIR}/tiles.txt"
CUTLINE="${REPO_ROOT}/data/subbasins/basin_outline.geojson"

# --- Remote source -----------------------------------------------------------
S3_BASE="https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com"
PRODUCT="Copernicus_DSM_COG_10"   # GLO-30 == "10"; GLO-90 would be "30"
GDAL_IMAGE="${GDAL_IMAGE:-ghcr.io/osgeo/gdal:ubuntu-small-latest}"

if [[ -f "${OUT_FILE}" && "${FORCE:-0}" != "1" ]]; then
  echo "DEM COG already exists: ${OUT_FILE}"
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
: > "${LIST_FILE}"

# --- 1. Discover which 1° tiles actually exist, build a /vsicurl/ list --------
echo "Probing Copernicus GLO-30 tiles for the Danube basin extent..."
found=0; missing=0
for lat in $(seq "${LAT_MIN}" "${LAT_MAX}"); do
  for lon in $(seq "${LON_MIN}" "${LON_MAX}"); do
    name=$(printf "%s_N%02d_00_E%03d_00_DEM" "${PRODUCT}" "${lat}" "${lon}")
    url="${S3_BASE}/${name}/${name}.tif"
    # HEAD request: cells over sea / outside coverage simply 404.
    if curl -sfI "${url}" >/dev/null 2>&1; then
      echo "/vsicurl/${url}" >> "${LIST_FILE}"
      found=$((found + 1))
    else
      missing=$((missing + 1))
    fi
  done
done
echo "Tiles found: ${found}   (skipped/absent: ${missing})"
if [[ "${found}" -eq 0 ]]; then
  echo "ERROR: no source tiles found — check network or bucket naming." >&2
  exit 1
fi

# Stage the cutline inside the work dir so it is visible in the container mount.
CUT_ARGS=""
if [[ "${USE_CUTLINE}" -eq 1 ]]; then
  cp "${CUTLINE}" "${WORK_DIR}/cutline.geojson"
  CUT_ARGS='-cutline /out/.work/cutline.geojson -crop_to_cutline -cutline_srs EPSG:4326'
fi

# --- 2. Mosaic -> clip/reproject -> COG, all inside the GDAL container --------
echo "Building DEM COG via ${GDAL_IMAGE} ..."
docker run --rm \
  -v "${OUT_DIR}:/out" \
  -e AWS_NO_SIGN_REQUEST=YES \
  -e GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR \
  -e CPL_VSIL_CURL_ALLOWED_EXTENSIONS=.tif \
  -e VSI_CACHE=TRUE \
  -e GDAL_HTTP_MULTIPLEX=YES \
  "${GDAL_IMAGE}" bash -c '
    set -euo pipefail
    cd /out/.work

    # Virtual mosaic of all source tiles (no pixel data copied yet).
    gdalbuildvrt -input_file_list tiles.txt mosaic.vrt

    # Clip (cutline or bbox), keep EPSG:4326, write a COG matching the project
    # profile (float32, nodata -9999, zstd, 512 blocks, average overviews).
    # The COG driver builds the full overview pyramid automatically (zoom 2-19).
    gdalwarp \
      -of COG \
      -t_srs EPSG:4326 \
      -te '"${WEST}"' '"${SOUTH}"' '"${EAST}"' '"${NORTH}"' \
      '"${CUT_ARGS}"' \
      -r bilinear \
      -dstnodata -9999 \
      -co COMPRESS=ZSTD \
      -co PREDICTOR=YES \
      -co BLOCKSIZE=512 \
      -co OVERVIEWS=AUTO \
      -co OVERVIEW_RESAMPLING=AVERAGE \
      -co NUM_THREADS=ALL_CPUS \
      -co BIGTIFF=YES \
      -overwrite \
      mosaic.vrt /out/dem.cog.tif

    gdalinfo /out/dem.cog.tif | sed -n "1,25p"
  '

# --- 3. Report & clean up ----------------------------------------------------
echo
echo "Done: ${OUT_FILE}  ($(du -h "${OUT_FILE}" | cut -f1))"
echo "Next: seed the Docker volume so TiTiler can serve it:"
echo "  (cd ${REPO_ROOT}/dwb-backend && \\"
echo "   docker compose --env-file .env.docker.local \\"
echo "     -f docker-compose.cog-seed.yml run --rm cog-seeder)"
rm -rf "${WORK_DIR}"
