# src/hydro_eval/cli.py
from __future__ import annotations

import argparse
import logging
from typing import Sequence

from hydro_eval.config.models import load_config
from hydro_eval.core.engine import AnalysisEngine, RunSpec
from hydro_eval.core.logging import LoggingConfig, setup_logging
from hydro_eval.io.loader import load_discharge_scenarios

logger = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    """Build CLI argument parser."""
    parser = argparse.ArgumentParser(
        prog="hydro-eval",
        description="Hydrological evaluation toolkit for CWatM outputs.",
    )
    parser.add_argument(
        "--config",
        required=False,
        default="config.toml",
        help="Path to the configuration file (default: config.toml)",
    )

    sub = parser.add_subparsers(dest="cmd", required=True)

    # ---- run ----
    run = sub.add_parser("run", help="Run the evaluation process.")
    run.add_argument(
        "--station",
        default=None,
        help="Run only for a single station (column name). If omitted, runs for all stations.",
    )
    run.add_argument(
        "--only",
        default=None,
        help="Coma-separated list of indicators to run (e.g. A1, B2, D1). Overrider config flags if specified.",
    )
    run.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would run (discovery + selection) and exit without executing the evaluation.",
    )

    # ---- list-stations ----
    ls = sub.add_parser(
        "list-stations", help="List available stations (column names) in the dataset."
    )
    ls.add_argument(
        "--like",
        default=None,
        help="Optional substring filter (case-insensitive) to match station names.",
    )

    return parser


def parse_only(value: str | None) -> list[str] | None:
    """Parse coma-separated list of indicator ids."""
    if not value:
        return None
    parts = [part.strip() for part in value.split(",") if part.strip()]
    return parts or None


def main(argv: Sequence[str] | None = None) -> None:
    """Entry points for 'hydro-eval' CLI."""
    parser = build_parser()
    args = parser.parse_args(argv)

    # 1) Load config (also resolves paths relative to config file location)
    cfg = load_config(args.config)

    # 2) Setup logging
    log_dir = cfg.paths.out_root / "logs"
    setup_logging(
        LoggingConfig(
            level=cfg.logging_level, log_dir=log_dir, filename="hydro-eval.log"
        )
    )
    logger.info(f"{'-' * 80}")
    logger.info(f"CLI command: {args.cmd}")
    logger.info(f"Config: {args.config}")

    # 3) Dispatch commands
    if args.cmd == "list-stations":
        index = load_discharge_scenarios(cfg, station=None)
        if not index:
            logger.error("No scenarios loaded. Cannot list stations.")
            return

        first_item = None
        for ds_map in index.values():
            for item in ds_map.values():
                first_item = item
                break
            if first_item is not None:
                break

        if first_item is None:
            logger.error("No scenarios found in index. Cannot list stations.")
            return

        stations = first_item.meta.cols  # station columns (excluding date)
        if args.like:
            needle = args.like.lower()
            stations = [station for station in stations if needle in station.lower()]

        # CLI listing: printing is acceptable here since it's the main output of this command.
        for station in stations:
            print(station)

        logger.info(f"Listed {len(stations)} stations.")
        return

    if args.cmd == "run":
        spec = RunSpec(
            station=args.station,
            only=parse_only(args.only),
            dry_run=bool(args.dry_run),
        )

        logger.info(
            f"Station: {args.station} | Only: {args.only} | Dry-run: {args.dry_run}"
        )
        logger.info(f"{'-' * 80}")
        engine = AnalysisEngine(cfg)
        engine.run(spec)
        return
