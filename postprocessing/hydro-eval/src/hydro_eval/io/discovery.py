# src/hydro_eval/io/discovery.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

@dataclass(frozen=True)
class ScenarioPath:
    """Represents one scenario directory (dataset/experiment)."""
    dataset: str
    experiment: str
    dir: Path

    def file(self, filename: str) -> Path:
        """return a file path inside the scenario directory."""
        return self.dir / filename
    
    def __repr__(self) -> str:
        return f"ScenarioPath(dataset={self.dataset}, experiment={self.experiment}, dir={self.dir})"
    
def discover_scenarios(data_root: Path) -> list[ScenarioPath]:
    """Discover dataset/experiment directories under data_root.

    Expected layout:
        data_root/
            <dataset>/
                <experiment>/
                    <variable_file>.csv

    Returns:
        A list of ScenarioPath objects (may be empty)."""
    scenarios: list[ScenarioPath] = []

    if not data_root.exists():
        logger.error(f"data_root does not exist: {data_root}")
        return scenarios
    
    if not data_root.is_dir():
        logger.error(f"data_root is not a directory: {data_root}")
        return scenarios
    
    dataset_dirs = [path for path in data_root.iterdir() if path.is_dir()]
    dataset_dirs.sort(key=lambda x: x.name.lower())  # sort by name, case-insensitive

    for ds_dir in dataset_dirs:
        exp_dirs = [path for path in ds_dir.iterdir() if path.is_dir()]
        exp_dirs.sort(key=lambda x: x.name.lower())

        for exp_dir in exp_dirs:
            scenarios.append(
                ScenarioPath(
                    dataset=ds_dir.name,
                    experiment=exp_dir.name,
                    dir=exp_dir.resolve(),
                )
            )
    logger.info(f"Discovered {len(scenarios)} scenarios under {data_root}")
    if scenarios:
        # Log a short sample for sanity-check, without spamming the console
        sample = scenarios[: min(5, len(scenarios))]
        for sc in sample:
            logger.debug(f"Discovered scenario: {sc}")
    
    return scenarios