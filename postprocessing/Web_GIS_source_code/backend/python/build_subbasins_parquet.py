#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_subbasins_parquet.py

Consolidate the 645 per-subbasin parquet files into a single sorted parquet
with a `subbasin_id` column. The output sits beside the original directory
(NOT replacing it), so rollback is just "set SUBBASIN_PARQUET_MODE=per-file".

Layout:
    src/subbasin_1.parquet, src/subbasin_2.parquet, ...
        -> dst/subbasins_all.parquet

The output is sorted by (subbasin_id, time) and written with small row groups
so DuckDB's row-group pruning kicks in when filtering on subbasin_id.

Idempotent: re-running with a newer-than-inputs output is a no-op.

Usage:
    python build_subbasins_parquet.py /data/subbasins /data/subbasins_consolidated
"""

import argparse
import re
import sys
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq


SUBBASIN_RE = re.compile(r"^subbasin_(\d+)$")


def _subbasin_id_from_path(path: Path) -> int | None:
    m = SUBBASIN_RE.match(path.stem)
    return int(m.group(1)) if m else None


def build_consolidated(src_dir: Path, dst_dir: Path) -> int:
    if not src_dir.is_dir():
        print(f"ERROR: source directory not found: {src_dir}", file=sys.stderr)
        return 1

    src_files = sorted(
        (p for p in src_dir.glob("subbasin_*.parquet") if _subbasin_id_from_path(p) is not None),
        key=lambda p: _subbasin_id_from_path(p),
    )
    if not src_files:
        print(f"ERROR: no subbasin_*.parquet files in {src_dir}", file=sys.stderr)
        return 1

    dst_dir.mkdir(parents=True, exist_ok=True)
    output = dst_dir / "subbasins_all.parquet"

    # Idempotency: skip if output is newer than every input.
    if output.exists():
        out_mtime = output.stat().st_mtime
        newest_input = max(f.stat().st_mtime for f in src_files)
        if out_mtime >= newest_input:
            print(
                f"{output} is up to date "
                f"({len(src_files)} input files, none newer than output) — skipping",
                file=sys.stderr,
            )
            return 0

    print(
        f"Consolidating {len(src_files)} files from {src_dir} -> {output}",
        file=sys.stderr,
    )

    tables = []
    for f in src_files:
        sid = _subbasin_id_from_path(f)
        t = pq.read_table(f)
        sid_col = pa.array([sid] * t.num_rows, type=pa.int32())
        t = t.append_column("subbasin_id", sid_col)
        tables.append(t)

    # promote_options="default" allows minor schema differences across files to
    # be unified (the older promote=True spelling is deprecated in pyarrow 17+).
    combined = pa.concat_tables(tables, promote_options="default")

    # First column in the original files is the time column. Be defensive
    # and prefer "time" if it exists, otherwise fall back to column 0.
    time_col = "time" if "time" in combined.column_names else combined.column_names[0]
    combined = combined.sort_by(
        [("subbasin_id", "ascending"), (time_col, "ascending")]
    )

    # Small row groups so each subbasin (~396 monthly rows) lives in roughly
    # one group, giving DuckDB clean row-group min/max stats on subbasin_id.
    pq.write_table(
        combined,
        output,
        compression="snappy",
        row_group_size=512,
        use_dictionary=True,
        write_statistics=True,
    )

    print(
        f"Wrote {output}: {combined.num_rows} rows, "
        f"{len(combined.column_names)} columns, "
        f"~{combined.num_rows // 512 + 1} row groups",
        file=sys.stderr,
    )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("src", help="Source directory containing subbasin_*.parquet")
    ap.add_argument("dst", help="Destination directory for subbasins_all.parquet")
    args = ap.parse_args()
    return build_consolidated(Path(args.src), Path(args.dst))


if __name__ == "__main__":
    sys.exit(main())
