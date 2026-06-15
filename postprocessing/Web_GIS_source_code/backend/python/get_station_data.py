#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# get_station_data.py
# Funkcija za dobijanje podataka o stanici za prikaz na mapi

import sys
import os
from pathlib import Path
import argparse
import duckdb
import pandas as pd
import json

# Postavi UTF-8 encoding za stdout
sys.stdout.reconfigure(encoding='utf-8')

TIME_CANDS = ["time", "time_utc", "datetime", "date", "timestamp", "month"]

# Eksplicitna DuckDB konekcija - omogucava kesiranje metapodataka parquet fajlova
_con = duckdb.connect(database=':memory:')


def find_station_column(parquet_file: Path, station_name: str):
    """
    Pronađi kolonu stanice po nazivu (case-insensitive).
    Vraća tuple (naziv kolone, naziv vremenske kolone).
    """
    try:
        cols = _con.sql(f"DESCRIBE SELECT * FROM read_parquet('{parquet_file}')").df()["column_name"].tolist()
    except Exception as e:
        print(f"Greška pri čitanju kolona: {e}", file=sys.stderr)
        return None, None

    print(f"Tražim kolonu za stanicu: '{station_name}'", file=sys.stderr)
    print(f"Dostupne kolone: {cols[:10]}...", file=sys.stderr)

    station_lower = station_name.lower().strip()
    cols_lower = [c.lower() for c in cols]

    if station_lower not in cols_lower:
        print(f"Kolona '{station_name}' nije pronađena", file=sys.stderr)
        return None, None

    real_station = cols[cols_lower.index(station_lower)]
    time_col = next((c for c in cols if c.lower() == 'month'), None)
    if not time_col:
        time_col = next((c for c in cols if c.lower() in TIME_CANDS), None)

    print(f"Pronađena kolona: {real_station}", file=sys.stderr)
    print(f"Vremenska kolona (month): {time_col}", file=sys.stderr)
    return real_station, time_col


def get_station_data(station_name):
    """
    Dobij podatke za stanicu na osnovu naziva stanice.
    Preskace prvi red koji sadrzi Subbasin ID-eve.
    """
    data_root = Path(os.environ.get("DATA_DIR", str(Path(__file__).parent.parent.parent / "data")))
    base = data_root / "stations"
    parquet_file = base / "stations_discharge_monthly_avg.parquet"

    if not parquet_file.exists():
        print(f"Parquet fajl ne postoji: {parquet_file}", file=sys.stderr)
        return None

    station_col, time_col = find_station_column(parquet_file, station_name)
    if not station_col:
        print(f"Kolona za stanicu {station_name} nije pronađena u fajlu {parquet_file}", file=sys.stderr)
        return None

    if not time_col:
        print(f"Vremenska kolona nije pronađena u fajlu {parquet_file}", file=sys.stderr)
        return None

    print(f"Pronađena kolona: {station_col} za stanicu: {station_name}", file=sys.stderr)

    q_station = '"' + station_col.replace('"', '""') + '"'
    q_time = '"' + time_col.replace('"', '""') + '"'

    try:
        # OFFSET 1 umesto ROW_NUMBER() - preskace prvi red (Subbasin ID-evi)
        df = _con.sql(
            f"""
            SELECT {q_time} AS time, {q_station} AS discharge
            FROM read_parquet('{parquet_file}')
            WHERE {q_station} IS NOT NULL AND {q_time} IS NOT NULL
            ORDER BY {q_time}
            OFFSET 1
            """
        ).df()

        if df.empty:
            print("Nema podataka za ovu stanicu.", file=sys.stderr)
            return None

        df["time"] = pd.to_datetime(df["time"], errors='coerce')
        df["discharge"] = pd.to_numeric(df["discharge"], errors='coerce')
        df = df.dropna(subset=["time", "discharge"]).reset_index(drop=True)

        # Vektorizovana konverzija u JSON - bez itertuples petlje
        data_points = (
            df.assign(date=df['time'].dt.strftime('%Y-%m-%d'))
              [['date', 'discharge']]
              .to_dict(orient='records')
        )

        result = {
            'station_name': station_col,
            'data_points': data_points,
            'total_points': len(data_points)
        }

        print(f"Pripremljeno {len(data_points)} tačaka za stanicu: {station_name}", file=sys.stderr)
        return result

    except Exception as e:
        print(f"Greška pri učitavanju podataka: {e}", file=sys.stderr)
        return None

def main():
    """
    Glavna funkcija - može se pozvati iz komandne linije ili direktno
    """
    ap = argparse.ArgumentParser(description='Dobij podatke za stanicu na osnovu naziva stanice')
    ap.add_argument("--station", help="Naziv stanice")
    args = ap.parse_args()

    if args.station:
        station_name = args.station
    else:
        # Ako se poziva bez argumenta, traži da se unese
        station_name = input("Unesite naziv stanice: ").strip()
    
    if not station_name:
        print("Naziv stanice je obavezan!", file=sys.stderr)
        sys.exit(1)

    print(f"Dobijanje podataka za stanicu: {station_name}", file=sys.stderr)
    data = get_station_data(station_name)
    
    if data:
        print(json.dumps(data, ensure_ascii=False))
    else:
        print("null")

if __name__ == "__main__":
    main()
