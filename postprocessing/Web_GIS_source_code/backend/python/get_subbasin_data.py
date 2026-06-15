#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# get_subbasin_data.py
# Funkcija za dobijanje podataka o subbasin-u za prikaz grafikona

import sys
import argparse
import duckdb
import pandas as pd
import json
from pathlib import Path
import os

# Postavi UTF-8 encoding za stdout
sys.stdout.reconfigure(encoding='utf-8')

START = pd.Timestamp("1990-01-01T00:00:00Z")
END   = pd.Timestamp("2020-01-01T00:00:00Z")

# Eksplicitna DuckDB konekcija - kesira metapodatke parquet fajlova
_con = duckdb.connect(database=':memory:')


def _resolve_source(data_root, subbasin_id):
    """
    Return (source_sql_expr, time_col_index, extra_filter_sql, mode) for the
    requested subbasin. When SUBBASIN_PARQUET_MODE=consolidated and the
    consolidated file exists, use it with a subbasin_id predicate — DuckDB
    prunes row groups via min/max stats. Otherwise fall back to the per-file
    layout (no behaviour change for callers).
    """
    mode = os.environ.get("SUBBASIN_PARQUET_MODE", "per-file").lower()
    consolidated_file = data_root / "subbasins_consolidated" / "subbasins_all.parquet"

    if mode == "consolidated" and consolidated_file.exists():
        source_expr = f"read_parquet('{consolidated_file}')"
        extra_filter = f' AND "subbasin_id" = {int(subbasin_id)}'
        return source_expr, extra_filter, "consolidated"

    per_file = data_root / "subbasins" / f"subbasin_{subbasin_id}.parquet"
    if not per_file.exists():
        return None, None, "per-file-missing"
    source_expr = f"read_parquet('{per_file}')"
    return source_expr, "", "per-file"


def get_subbasin_data(subbasin_id):
    """
    Dobij podatke za subbasin na osnovu subbasin ID-a.
    Vektorizovana obrada svih kolona bez Dask overhead-a.
    """
    data_root = Path(os.environ.get("DATA_DIR", str(Path(__file__).parent.parent.parent / "data")))

    source_expr, extra_filter, mode = _resolve_source(data_root, subbasin_id)
    if source_expr is None:
        print(f"Parquet fajl ne postoji za subbasin {subbasin_id} (mode={mode})", file=sys.stderr)
        return None

    print(f"Source: {source_expr} (mode={mode})", file=sys.stderr)

    try:
        cols = _con.sql(f"DESCRIBE SELECT * FROM {source_expr}").df()["column_name"].tolist()
        print(f"Dostupne kolone: {cols[:5]}... (ukupno {len(cols)})", file=sys.stderr)

        # In consolidated mode the schema contains an extra "subbasin_id" column;
        # the time column is still the first NON-subbasin_id column written by the
        # build script, which preserves the original ordering.
        time_col = next((c for c in cols if c != "subbasin_id"), cols[0])

        # Kolone koje zelimo - mesecni podaci (avg i sum varijante)
        target_cols = [
            "danube_ETRef_monthly_avg", "danube_ETRef_monthly_sum",
            "danube_IceMelt_monthly_avg", "danube_IceMelt_monthly_sum",
            "danube_Rain_monthly_avg", "danube_Rain_monthly_sum",
            "danube_SnowFraction_monthly_avg", "danube_SnowFraction_monthly_sum",
            "danube_SnowMelt_monthly_avg", "danube_SnowMelt_monthly_sum",
            "danube_Snow_monthly_avg", "danube_Snow_monthly_sum",
            "danube_runoff_monthly_avg", "danube_runoff_monthly_sum",
            "danube_totalET_WB_monthly_avg", "danube_totalET_WB_monthly_sum",
            "danube_tws_monthly_avg", "danube_tws_monthly_sum",
            # Discharge intentionally excluded from subbasin charts —
            # consult discharge via the calibration-station charts or the
            # discharge raster layer instead. Uncomment to re-enable.
            # "danube_discharge_monthly_avg", "danube_discharge_monthly_sum"
        ]
        available_cols = [col for col in target_cols if col in cols]

        if not available_cols:
            print(f"Ni jedna od traženih kolona nije pronađena", file=sys.stderr)
            return None

        print(f"Pronađene kolone: {len(available_cols)} od {len(target_cols)}", file=sys.stderr)

        q_time = '"' + time_col.replace('"', '""') + '"'
        select_cols = [q_time + " AS time"]
        for col in available_cols:
            q_col = '"' + col.replace('"', '""') + '"'
            select_cols.append(q_col)

        sql = f"""
            SELECT {', '.join(select_cols)}
            FROM {source_expr}
            WHERE {q_time} >= '1990-01-01' AND {q_time} < '2020-01-01'{extra_filter}
            ORDER BY {q_time}
        """

        df = _con.sql(sql).df()

        if len(df) == 0:
            print("Nema podataka u fajlu.", file=sys.stderr)
            return None

        # Vektorizovana konverzija vremena - jednom za sve kolone
        df['time'] = pd.to_datetime(df['time']).dt.strftime('%Y-%m-%d')

        # Vektorizovana obrada svake kolone - bez iterrows, bez Dask-a
        datasets = []
        for col in available_cols:
            col_data = df[['time', col]].dropna(subset=[col])
            if col_data.empty:
                continue

            data_points = (
                col_data.rename(columns={'time': 'date', col: 'value'})
                        .assign(value=lambda x: x['value'].astype(float))
                        .to_dict(orient='records')
            )

            datasets.append({
                'column_name': col,
                'data_points': data_points,
                'total_points': len(data_points)
            })
            print(f"  {col}: {len(data_points)} tačaka", file=sys.stderr)

        result = {
            'subbasin_id': subbasin_id,
            'datasets': datasets
        }

        print(f"\nPripremljeno {len(datasets)} dataset-a za subbasin ID: {subbasin_id}", file=sys.stderr)
        return result

    except Exception as e:
        print(f"Greška pri učitavanju podataka: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return None


def main():
    ap = argparse.ArgumentParser(description='Dobij podatke za subbasin')
    ap.add_argument("--subbasin_id", help="Subbasin ID")
    args = ap.parse_args()

    if not args.subbasin_id:
        print("Subbasin ID je obavezan! Koristi --subbasin_id parametar", file=sys.stderr)
        sys.exit(1)

    print(f"Dobijanje podataka za subbasin ID: {args.subbasin_id}", file=sys.stderr)
    data = get_subbasin_data(args.subbasin_id)

    if data:
        print(json.dumps(data, ensure_ascii=False))
    else:
        print("null")


if __name__ == "__main__":
    main()
