#!/usr/bin/env bash
# =============================================================================
# prepare-hydro-data.sh — Generate the committed River Network + Water Bodies
# seed files from HydroRIVERS v1.0 and HydroLAKES v1.0.
#
# This is a ONE-OFF developer tool, NOT part of the Docker/VM rebuild path.
# It downloads the source shapefiles, clips them to the Danube basin, loads the
# result into the running PostGIS, and dumps INSERT-only SQL that is gzipped
# into docker/init-db/. Those committed .sql.gz files are what Postgres replays
# automatically on every fresh container (docker-entrypoint-initdb.d gunzips
# *.sql.gz), so a VM rebuild needs no network and no GDAL.
#
# Mirrors the existing tooling:
#   - seed_dem_cog.sh        -> GDAL via the official OSGeo Docker image
#   - export-seed-data.sh    -> pg_dump --data-only --inserts + restrict cleanup
#
# Sources / licenses (see docker/init-db/HYDRO_DATA.md):
#   HydroRIVERS v1.0  https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_eu_shp.zip
#                     free for scientific/educational/commercial use
#   HydroLAKES v1.0   https://data.hydrosheds.org/file/hydrolakes/HydroLAKES_polys_v10_shp.zip
#                     CC-BY 4.0 (attribution required)
#
# Prerequisites: Docker (for GDAL), and the DWB PostGIS container running
# (dwb-db) so the data can be loaded + dumped and the basin cutline built.
#
# Usage:
#   ./docker/scripts/prepare-hydro-data.sh
#   MIN_ORD_STRA=6 ./docker/scripts/prepare-hydro-data.sh   # leaner river net
#   FORCE_DOWNLOAD=1 ./docker/scripts/prepare-hydro-data.sh # re-download zips
# =============================================================================
set -euo pipefail

# --- Config / connection -----------------------------------------------------
# The Postgres container name (psql/pg_dump are run inside it via docker exec,
# so no host libpq is required — same approach as seed_dem_cog.sh).
DB_CONTAINER="${DB_CONTAINER:-dwb-db}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-admin}"
PGDATABASE="${PGDATABASE:-DWB}"

# How ogr2ogr (inside the GDAL container) reaches Postgres. The compose stack
# publishes the DB on host port 5433; the GDAL container talks to the host.
HOST_PG_HOST="${HOST_PG_HOST:-host.docker.internal}"
HOST_PG_PORT="${HOST_PG_PORT:-5433}"

# Keep only reaches at/above this Strahler order (1=tiny stream .. ~8-9=Danube
# main stem). Default 1 = the full Danube network (~58k reaches): the rivers MVT
# endpoint (TilesService.riversMinOrderForZoom) then tiers visible detail by
# zoom, so smaller rivers appear as the user zooms in. Raise this only to shrink
# the committed seed at the cost of never being able to show small rivers.
MIN_ORD_STRA="${MIN_ORD_STRA:-1}"

GDAL_IMAGE="${GDAL_IMAGE:-ghcr.io/osgeo/gdal:ubuntu-small-latest}"

RIVERS_URL="https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_eu_shp.zip"
LAKES_URL="https://data.hydrosheds.org/file/hydrolakes/HydroLAKES_polys_v10_shp.zip"

# --- Paths -------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INIT_DIR="$(cd "${SCRIPT_DIR}/../init-db" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
REPO_ROOT="$(cd "${BACKEND_DIR}/.." && pwd)"
WORK_DIR="${HYDRO_WORK_DIR:-${BACKEND_DIR}/.hydro-cache}"   # downloads (gitignored)
CUTLINE="${WORK_DIR}/danube_outline.geojson"

mkdir -p "${WORK_DIR}"

dexec()  { docker exec -e PGPASSWORD="${PGPASSWORD}" "${DB_CONTAINER}" "$@"; }
dexec_i(){ docker exec -i -e PGPASSWORD="${PGPASSWORD}" "${DB_CONTAINER}" "$@"; }
psql_c() { dexec psql -U "${PGUSER}" -d "${PGDATABASE}" -v ON_ERROR_STOP=1 "$@"; }

echo "=== DWB hydro seed-data preparation ==="
echo "  DB container : ${DB_CONTAINER} (${PGUSER}/${PGDATABASE})"
echo "  GDAL image   : ${GDAL_IMAGE}"
echo "  River filter : ORD_STRA >= ${MIN_ORD_STRA}"
echo "  Work dir     : ${WORK_DIR}"
echo ""

if ! docker ps --format '{{.Names}}' | grep -qx "${DB_CONTAINER}"; then
  echo "ERROR: Postgres container '${DB_CONTAINER}' is not running." >&2
  echo "Start it first, e.g.:" >&2
  echo "  docker compose --env-file .env.docker.local -f docker-compose.local.yml up -d db" >&2
  exit 1
fi

# --- 1. Download + unzip source shapefiles -----------------------------------
fetch() {
  local url="$1" zip="${WORK_DIR}/$(basename "$1")"
  if [[ -f "${zip}" && "${FORCE_DOWNLOAD:-0}" != "1" ]]; then
    echo "  cached: $(basename "${zip}")"
  else
    echo "  downloading $(basename "${zip}") ..."
    curl -fL --retry 3 -o "${zip}" "${url}"
  fi
  ( cd "${WORK_DIR}" && unzip -o -q "${zip}" )
}
echo "[1/5] Fetching source data (HydroLAKES is ~820 MB; one-time)..."
fetch "${RIVERS_URL}"
fetch "${LAKES_URL}"

# Locate the unzipped .shp files (layout varies slightly between packs).
RIVERS_SHP="$(find "${WORK_DIR}" -iname 'HydroRIVERS_v10_eu.shp' | head -n1)"
LAKES_SHP="$(find "${WORK_DIR}" -iname 'HydroLAKES_polys_v10.shp' | head -n1)"
[[ -n "${RIVERS_SHP}" ]] || { echo "ERROR: HydroRIVERS_v10_eu.shp not found after unzip" >&2; exit 1; }
[[ -n "${LAKES_SHP}"  ]] || { echo "ERROR: HydroLAKES_polys_v10.shp not found after unzip"  >&2; exit 1; }
RIVERS_LAYER="$(basename "${RIVERS_SHP}" .shp)"
LAKES_LAYER="$(basename "${LAKES_SHP}" .shp)"

# --- 2. (Re)create target tables, empty -------------------------------------
# Drop first so a changed column type in 02a-create-hydro-tables.sql always
# takes effect on regeneration (CREATE TABLE IF NOT EXISTS would not alter an
# existing table). Safe: the data is fully reloaded below.
echo "[2/5] (Re)creating empty rivers/water_bodies tables..."
psql_c -c "DROP TABLE IF EXISTS public.rivers, public.water_bodies CASCADE;" >/dev/null
dexec_i psql -U "${PGUSER}" -d "${PGDATABASE}" -v ON_ERROR_STOP=1 \
  < "${INIT_DIR}/02a-create-hydro-tables.sql" >/dev/null

# --- 3. Build the Danube cutline (dissolved subbasin outline) ----------------
echo "[3/5] Building Danube basin cutline from ST_Union(subbasins)..."
psql_c -t -A -c \
  "SELECT json_build_object('type','FeatureCollection','features',
     json_build_array(json_build_object('type','Feature','properties','{}'::json,
       'geometry', ST_AsGeoJSON(ST_Union(ST_MakeValid(geom)),6)::json)))
   FROM public.subbasins;" > "${CUTLINE}"
if [[ ! -s "${CUTLINE}" ]]; then
  echo "ERROR: cutline came back empty — is the subbasins table seeded?" >&2
  exit 1
fi

# --- 4. Clip + load into PostGIS via ogr2ogr (OSGeo GDAL container) -----------
# ogr2ogr connects to Postgres on the host-published port; -append writes into
# the existing typed tables. -sql selects/renames just the columns we keep and
# (rivers) filters by Strahler order; -clipsrc trims to the basin outline.
PGCONN="PG:host=${HOST_PG_HOST} port=${HOST_PG_PORT} dbname=${PGDATABASE} user=${PGUSER} password=${PGPASSWORD}"

run_ogr() { # args passed straight to ogr2ogr inside the container
  docker run --rm \
    --add-host=host.docker.internal:host-gateway \
    -v "${WORK_DIR}:/work" \
    "${GDAL_IMAGE}" ogr2ogr "$@"
}

echo "[4/5] Clipping + loading rivers (ORD_STRA >= ${MIN_ORD_STRA})..."
run_ogr -f PostgreSQL "${PGCONN}" \
  -nln rivers -append -update \
  -t_srs EPSG:4326 \
  -nlt PROMOTE_TO_MULTI \
  -clipsrc /work/danube_outline.geojson \
  -dialect OGRSQL \
  -sql "SELECT HYRIV_ID AS hyriv_id, NEXT_DOWN AS next_down, ORD_STRA AS ord_stra, ORD_FLOW AS ord_flow, DIS_AV_CMS AS dis_av_cms, LENGTH_KM AS length_km FROM \"${RIVERS_LAYER}\" WHERE ORD_STRA >= ${MIN_ORD_STRA}" \
  -skipfailures \
  "/work/${RIVERS_SHP#"${WORK_DIR}"/}"

echo "      Clipping + loading water bodies..."
run_ogr -f PostgreSQL "${PGCONN}" \
  -nln water_bodies -append -update \
  -t_srs EPSG:4326 \
  -nlt PROMOTE_TO_MULTI \
  -clipsrc /work/danube_outline.geojson \
  -dialect OGRSQL \
  -sql "SELECT Hylak_id AS hylak_id, Lake_name AS lake_name, Lake_type AS lake_type, Lake_area AS lake_area, Depth_avg AS depth_avg, Vol_total AS vol_total, Shore_len AS shore_len FROM \"${LAKES_LAYER}\"" \
  -skipfailures \
  "/work/${LAKES_SHP#"${WORK_DIR}"/}"

RIVER_ROWS="$(psql_c -t -A -c 'SELECT count(*) FROM public.rivers;')"
LAKE_ROWS="$(psql_c -t -A -c 'SELECT count(*) FROM public.water_bodies;')"
echo "      Loaded: ${RIVER_ROWS} river reaches, ${LAKE_ROWS} water bodies."

# --- 5. Dump INSERT-only SQL and gzip into init-db ---------------------------
echo "[5/5] Dumping seed SQL -> gzip into ${INIT_DIR} ..."
dump_table() { # <table> <out.sql.gz>
  dexec pg_dump -U "${PGUSER}" -d "${PGDATABASE}" \
      --table="$1" --data-only --inserts --no-owner --no-privileges \
    | grep -v -E '^\\(un)?restrict' \
    | gzip -9 > "$2"
}
dump_table rivers       "${INIT_DIR}/04a-seed-rivers.sql.gz"
dump_table water_bodies "${INIT_DIR}/04b-seed-water-bodies.sql.gz"

echo ""
echo "=== Done ==="
ls -lh "${INIT_DIR}/04a-seed-rivers.sql.gz" "${INIT_DIR}/04b-seed-water-bodies.sql.gz"
echo ""
echo "Commit the two .sql.gz files. They load automatically on a fresh DB:"
echo "  docker compose --env-file .env.docker.local -f docker-compose.local.yml down -v"
echo "  docker compose --env-file .env.docker.local -f docker-compose.local.yml up -d db"
