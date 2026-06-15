#!/bin/bash
# =============================================================================
# Export seed data from local PostgreSQL to Docker init-db scripts.
#
# Usage:
#   ./docker/scripts/export-seed-data.sh
#
# Override connection settings via environment variables:
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=admin PGDATABASE=DWB \
#     ./docker/scripts/export-seed-data.sh
#
# Run from: g:/DWB/dwb-backend/  (or the repo root containing docker/)
# Prerequisites: local PostgreSQL running with the DWB database
# =============================================================================

set -euo pipefail

# Connection defaults (match local dev setup)
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-admin}"
export PGDATABASE="${PGDATABASE:-DWB}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INIT_DIR="$(cd "$SCRIPT_DIR/../init-db" && pwd)"

echo "=== DWB Seed Data Export ==="
echo "Source: ${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"
echo "Target: ${INIT_DIR}"
echo ""

# 1. Export table schemas
echo "[1/3] Exporting table schemas..."
pg_dump \
  --table=calib_stations --table=subbasins \
  --schema-only --no-owner --no-privileges \
  > "${INIT_DIR}/02-create-tables.sql"
echo "  -> 02-create-tables.sql"

# 2. Export calib_stations data
echo "[2/3] Exporting calib_stations data..."
pg_dump \
  --table=calib_stations \
  --data-only --inserts --no-owner --no-privileges \
  > "${INIT_DIR}/03-seed-calib-stations.sql"
echo "  -> 03-seed-calib-stations.sql"

# 3. Export subbasins data
echo "[3/3] Exporting subbasins data..."
pg_dump \
  --table=subbasins \
  --data-only --inserts --no-owner --no-privileges \
  > "${INIT_DIR}/04-seed-subbasins.sql"
echo "  -> 04-seed-subbasins.sql"

# 4. Remove \restrict / \unrestrict lines (pg_dump 17+ adds these)
echo ""
echo "Cleaning pg_dump 17 restrict directives..."
python -c "
import sys, os
backslash = chr(92)
for f in sys.argv[1:]:
    with open(f, 'r', encoding='utf-8') as fh:
        lines = fh.readlines()
    filtered = [l for l in lines if not l.strip().startswith(backslash + 'restrict') and not l.strip().startswith(backslash + 'unrestrict')]
    with open(f, 'w', encoding='utf-8') as fh:
        fh.writelines(filtered)
    removed = len(lines) - len(filtered)
    if removed > 0:
        print(f'  Removed {removed} lines from {os.path.basename(f)}')
" "${INIT_DIR}/02-create-tables.sql" "${INIT_DIR}/03-seed-calib-stations.sql" "${INIT_DIR}/04-seed-subbasins.sql"

# 5. Verify row counts
echo ""
echo "Verifying exported data..."
STATIONS=$(grep -c "^INSERT INTO" "${INIT_DIR}/03-seed-calib-stations.sql" || echo "0")
SUBBASINS=$(grep -c "^INSERT INTO" "${INIT_DIR}/04-seed-subbasins.sql" || echo "0")
echo "  calib_stations: ${STATIONS} rows"
echo "  subbasins:      ${SUBBASINS} rows"

echo ""
echo "=== Export complete ==="
echo ""
echo "Files in ${INIT_DIR}:"
ls -lh "${INIT_DIR}"/*.sql
echo ""
echo "Next steps:"
echo "  1. docker compose --env-file .env.docker.local down -v"
echo "  2. docker compose --env-file .env.docker.local up -d --build"
