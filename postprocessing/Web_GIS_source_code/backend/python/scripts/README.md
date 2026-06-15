# DWB data scripts

CLI utilities for maintaining the hydrological NetCDF/parquet pipeline. Run them from the `dwb-backend/python/scripts/` directory or via `python -m` from the project root. Each script handles `--help`.

| Script | Purpose |
|---|---|
| `aggregate_daily_to_monthly.py` | Re-aggregate daily NetCDFs to monthly mean (or sum). Replaces the broken `monthly median` pipeline — see [DATA_QUALITY.md](../../docs/DATA_QUALITY.md). |
| `check_data_quality.py` | Scan `data/nc/month/*.nc` and flag any file whose aggregation attribute is forbidden (median, mode, min, max). Exits non-zero for CI. |

## Quick reference

Re-aggregate daily NetCDFs (the permanent fix once daily files are available):

```bash
python python/scripts/aggregate_daily_to_monthly.py \
    --input  /path/to/daily \
    --output data/nc/month \
    --method mean \
    --force
```

Validate the existing monthly files:

```bash
python python/scripts/check_data_quality.py
# defaults to <repo>/data/nc/month
```

## Dependencies

Both scripts require `xarray` and `netCDF4`, already listed in `python/requirements.txt`.

## Full regeneration pipeline (`pipeline/`)

End-to-end ETL that produces the monthly NetCDFs and per-subbasin Parquet files the backend reads. Run when new source data arrives. Driven by `pipeline/run_all.sh`; stages can also be invoked individually.

| Stage | Script | Reads | Writes |
|---|---|---|---|
| 0 | `pipeline/00_export_subbasins_geojson.py` | Postgres `subbasins` table | `subbasins.geojson` |
| 1 | `pipeline/01_mosaic_daily.py` | 7 regional daily NetCDFs (Drava, Lower, Middle, Morava, Sava, Tisa, Upper) | 10 Danube-wide daily NetCDFs in `danube_daily/` |
| 2 | `pipeline/02_daily_to_monthly.py` | `danube_daily/*.nc` | Monthly means in `nc/month/` (time axis re-based to `1990-01`) |
| 3 | `pipeline/03_subbasins_to_parquet.py` | `nc/month/*.nc` + `subbasins.geojson` | One Parquet per subbasin in `subbasins/` (`{var}_avg`, `{var}_sum` columns) |

Run the whole thing:

```bash
./pipeline/run_all.sh              # full regeneration with cleanup
./pipeline/run_all.sh --no-clean   # resume after a failed stage (no cleanup)
```

`run_all.sh` expects a Python virtualenv at `../.venv/bin/python` (relative to the script) and writes timestamped per-stage logs to `../logs/`. After each stage it validates that the expected output files exist.

### Operator notes (pipeline is laptop-only today)

- **Paths are hardcoded** to `/Users/lang/Documents/DWB NEW Data/...` inside the Python files. They'll only run on the original operator's machine until they're parameterised. Symlink or adjust the source location accordingly.
- **Stage 2 fakes the time axis** to start at `1990-01` regardless of actual coverage — deliberate, matches the Parquet schema the backend reads.
- **Stage 3's `POLY_ID_FIELD = "id"`** must match the GeoJSON property that maps to `subbasins.id` in Postgres. Stage 0 prints candidate fields; check it if the schema changes.
- **New dependencies for this pipeline** (added to `python/requirements.txt`): `psycopg2-binary` (stage 0) and `geopandas` (stage 3). If you run stage 3 inside Docker, verify the image has `libgeos-dev` and `libproj-dev` alongside the existing GDAL/HDF5/NetCDF libs.
