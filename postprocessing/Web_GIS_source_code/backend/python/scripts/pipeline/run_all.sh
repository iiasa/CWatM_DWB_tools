#!/usr/bin/env bash
# run_all.sh — full regeneration of the DWB downstream pipeline.
#
# Default flow:
#   1. Delete generated artifacts in danube_daily/, nc/month/, subbasins/.
#   2. Run 01_mosaic_daily.py  -> danube_daily/danube_<VAR>_daily.nc
#   3. Run 02_daily_to_monthly.py -> nc/month/danube_<VAR>_monthly.nc
#   4. Run 03_subbasins_to_parquet.py -> subbasins/subbasin_<pid>.parquet
#
# Inputs kept untouched:
#   /Users/lang/Documents/DWB Data/<basin>/out/*.nc      (step 0)
#   /Users/lang/Documents/DWB NEW Data/subbasins.geojson (step 0 output)
#
# Flags:
#   --no-clean   skip the delete step (resume after partial failure)

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ROOT_DIR="$( cd -- "${SCRIPT_DIR}/.." &> /dev/null && pwd )"

VENV_PY="${ROOT_DIR}/.venv/bin/python"
LOG_DIR="${ROOT_DIR}/logs"

DANUBE_DAILY="${ROOT_DIR}/danube_daily"
NC_MONTH="${ROOT_DIR}/nc/month"
SUBBASINS="${ROOT_DIR}/subbasins"

DO_CLEAN=1
if [[ "${1:-}" == "--no-clean" ]]; then
    DO_CLEAN=0
fi

if [[ ! -x "${VENV_PY}" ]]; then
    echo "[FATAL] venv python not found at ${VENV_PY}" >&2
    exit 1
fi

mkdir -p "${LOG_DIR}" "${DANUBE_DAILY}" "${NC_MONTH}" "${SUBBASINS}"

ts() { date +%Y%m%d_%H%M%S; }

run_stage() {
    local label="$1" script="$2" check_dir="$3" check_glob="$4" min_count="$5"
    local log="${LOG_DIR}/${label}_$(ts).log"
    echo
    echo "================================================================"
    echo "[STAGE] ${label}"
    echo "[CMD ] ${VENV_PY} ${SCRIPT_DIR}/${script}"
    echo "[LOG ] ${log}"
    echo "================================================================"
    if ! "${VENV_PY}" "${SCRIPT_DIR}/${script}" 2>&1 | tee "${log}"; then
        echo "[FATAL] ${label} failed. See ${log}" >&2
        exit 1
    fi
    local n
    n=$(find "${check_dir}" -maxdepth 1 -name "${check_glob}" -type f | wc -l | tr -d ' ')
    if (( n < min_count )); then
        echo "[FATAL] ${label} produced only ${n} files matching ${check_glob} in ${check_dir} (expected >= ${min_count}). See ${log}" >&2
        exit 1
    fi
    echo "[OK  ] ${label} produced ${n} files in ${check_dir}"
}

if (( DO_CLEAN )); then
    echo "[CLEAN] Removing previously generated artifacts…"
    rm -f "${DANUBE_DAILY}/"*.nc 2>/dev/null || true
    rm -f "${NC_MONTH}/"*.nc 2>/dev/null || true
    rm -f "${SUBBASINS}/"subbasin_*.parquet 2>/dev/null || true
    echo "[CLEAN] Done."
else
    echo "[CLEAN] Skipped (--no-clean)."
fi

run_stage "01_mosaic_daily"        "01_mosaic_daily.py"        "${DANUBE_DAILY}" "*.nc"               1
run_stage "02_daily_to_monthly"    "02_daily_to_monthly.py"    "${NC_MONTH}"     "*.nc"               1
run_stage "03_subbasins_to_parquet" "03_subbasins_to_parquet.py" "${SUBBASINS}"   "subbasin_*.parquet" 1

echo
echo "[DONE] Full regeneration finished. Counts:"
echo "  danube_daily/ : $(find "${DANUBE_DAILY}" -maxdepth 1 -name '*.nc' -type f | wc -l | tr -d ' ')"
echo "  nc/month/     : $(find "${NC_MONTH}"     -maxdepth 1 -name '*.nc' -type f | wc -l | tr -d ' ')"
echo "  subbasins/    : $(find "${SUBBASINS}"    -maxdepth 1 -name 'subbasin_*.parquet' -type f | wc -l | tr -d ' ')"
