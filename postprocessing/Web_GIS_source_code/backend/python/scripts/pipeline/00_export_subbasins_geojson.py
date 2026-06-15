#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# 00_export_subbasins_geojson.py
#
# Exports the `subbasins` table from the local DWB Postgres database
# to a GeoJSON FeatureCollection at:
#   /Users/lang/Documents/DWB NEW Data/subbasins.geojson
#
# Uses PostGIS ST_AsGeoJSON for the geometry. All other columns become
# feature properties. Credentials read from environment variables, with
# defaults matching dwb-backend/env.example.

import os
import sys
import json
from pathlib import Path

import psycopg2

OUT_PATH = Path("/Users/lang/Documents/DWB NEW Data/subbasins.geojson")

DB_HOST = os.environ.get("DATABASE_HOST", "localhost")
DB_PORT = int(os.environ.get("DATABASE_PORT", "5432"))
DB_USER = os.environ.get("DATABASE_USERNAME", "postgres")
DB_PASS = os.environ.get("DATABASE_PASSWORD", "admin")
DB_NAME = os.environ.get("DATABASE_NAME", "DWB")

SQL = """
SELECT row_to_json(fc)
FROM (
  SELECT 'FeatureCollection' AS type,
         COALESCE(json_agg(row_to_json(f)), '[]'::json) AS features
  FROM (
    SELECT 'Feature' AS type,
           ST_AsGeoJSON("geom")::json AS geometry,
           to_jsonb(s) - 'geom' AS properties
    FROM subbasins s
  ) f
) fc;
"""

def main():
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    print(f"[INFO] Connecting to postgres {DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME}")
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        dbname=DB_NAME,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(SQL)
            row = cur.fetchone()
            if row is None or row[0] is None:
                print("[ERR] Empty result from subbasins table", file=sys.stderr)
                return 1
            feature_collection = row[0]
    finally:
        conn.close()

    n_features = len(feature_collection.get("features") or [])
    print(f"[INFO] Got {n_features} features, writing {OUT_PATH}")

    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(feature_collection, fh, ensure_ascii=False)

    if n_features:
        sample_props = (feature_collection["features"][0] or {}).get("properties") or {}
        print("[INFO] Sample feature property keys:")
        print("       " + ", ".join(sorted(sample_props.keys())))
        numeric_props = {
            k: v for k, v in sample_props.items()
            if isinstance(v, (int, float)) and not isinstance(v, bool)
        }
        if numeric_props:
            print("[INFO] Numeric sample values (use these to pick POLY_ID_FIELD in 03_subbasins_to_parquet.py):")
            for k, v in sorted(numeric_props.items()):
                print(f"       {k} = {v}")

    print(f"[OK] Wrote {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
