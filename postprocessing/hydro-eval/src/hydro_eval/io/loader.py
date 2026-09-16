# src/hydro_eval/io/loader.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict
import pandas as pd

from hydro_eval.config.models import AppConfig
from hydro_eval.io.discovery import ScenarioPath, discover_scenarios
from hydro_eval.io.reader import GridMeta, read_variable_csv

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LoadedScenario:
    """One loaded scenario dataset."""

    scenario: ScenarioPath
    df: pd.DataFrame
    meta: GridMeta

    def __repr__(self) -> str:
        return f"{self.scenario.dataset}/{self.scenario.experiment} (shape={self.df.shape})"


ScenarioIndex = Dict[
    str, Dict[str, LoadedScenario]
]  # dataset -> experiment -> LoadedScenario


def load_discharge_scenarios(
    cfg: AppConfig, station: str | None = None
) -> ScenarioIndex:
    """Discover and load discharge time series for all available scenarios.

    Args:
        cfg: Application config.
        profile: Optional station/profile column name. If provided, loads only that station.

    Returns:
        Dict of loaded scenarios, keyed by dataset and then experiment.
    """
    scenarios = discover_scenarios(cfg.paths.data_root)
    if not scenarios:
        logger.warning(
            f"No scenario directories discovered under {cfg.paths.data_root}"
        )
        return {}

    filename = cfg.parameters.variable_file
    stations = [station] if station else None

    index: ScenarioIndex = {}
    missing_files = 0
    failed_reads = 0

    for scenario in scenarios:
        file_path = scenario.file(filename)
        if not file_path.exists():
            missing_files += 1
            logger.warning(
                f"Missing file for {scenario.dataset}/{scenario.experiment}: {file_path}"
            )
            continue
        try:
            df, meta = read_variable_csv(file_path, stations=stations)
        except (ValueError, FileNotFoundError) as e:
            failed_reads += 1
            logger.warning(
                f"Failed reading file from {file_path}. Skipping:...\n {scenario.dataset}/{scenario.experiment} | Error: {type(e).__name__}: {e}"
            )

            continue
        except Exception:
            failed_reads += 1
            logger.exception(f"Unexpected error reading file from {file_path}.")
            continue

        index.setdefault(scenario.dataset, {})
        index[scenario.dataset][scenario.experiment] = LoadedScenario(
            scenario=scenario, df=df, meta=meta
        )

    logger.info(
        f"Loaded {len([item for ds_map in index.values() for item in ds_map.values()])} scenarios | {missing_files=} | {failed_reads=}."
    )

    # short debug overview of loaded scenarios
    for dataset, exp_dict in index.items():
        for exp, item in exp_dict.items():
            logger.debug(f"Loaded {item}")

    return index
