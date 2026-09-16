# src/hydro_eval/core/comparison.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, Iterable

from hydro_eval.config.models import AppConfig
from hydro_eval.io.loader import ScenarioIndex, LoadedScenario

logger = logging.getLogger(__name__)

@dataclass(frozen=True)
class DatasetComparison:
    reference: LoadedScenario
    targets: Dict[str, LoadedScenario]  # experiment -> scenario



ComparisonView = Dict[str, DatasetComparison]  # dataset -> comparison


def _format_station_list(items: Iterable[str], limit: int = 10) -> str:
    xs = sorted(items)
    if len(xs) <= limit:
        return ", ".join(xs)
    return ", ".join(xs[:limit]) + f", ... (+{len(xs) - limit} more)"

def build_comparison_view(index: ScenarioIndex, cfg: AppConfig) -> ComparisonView:
    """Build reference vs target mapping per dataset.

    Rules:
        - reference experiment defined in config
        - targets:
            * explicit list from config, OR
            * all experiments except reference
    """
    ref_name = cfg.comparison.reference_experiment
    target_names = cfg.comparison.target_experiments

    view: ComparisonView = {}

    for dataset, experiments in index.items():
        if ref_name not in experiments:
            logger.warning(
                f"Dataset {dataset} skipped. Reference experiment '{ref_name}' not found.",
            )
            continue

        reference = experiments[ref_name]
        ref_st = set(reference.meta.cols)

        if target_names is None:
            # automatic selection of all experiments except reference
            targets = {
                experiment: scenario for experiment, scenario in experiments.items() if experiment != ref_name
            }
        else:
            targets = {
                experiment: experiments[experiment] for experiment in target_names if experiment in experiments
            }

        if not targets:
            logger.warning(
                f"Dataset {dataset} skipped. No valid target experiments found.",
            )
            continue
        
        # Lenient station mismatch warnings
        for experiment, target in targets.items():
            tgt_st = set(target.meta.cols)
            missing = ref_st - tgt_st
            extra = tgt_st - ref_st

            if missing or extra:
                msg = (
                    f"Dataset '{dataset}' target '{experiment}' station mismatch vs reference '{ref_name}': \n"
                    f"missing={len(missing)} extra={len(extra)}"
                )
                parts = [msg]

                if missing:
                    parts.append(f"missing sample: {_format_station_list(missing)}")
                if extra:
                    parts.append(f"extra sample: {_format_station_list(extra)}")

                logger.warning(" | ".join(parts))

        view[dataset] = DatasetComparison(
            reference=reference,
            targets=targets,
        )

    logger.info(
        f"Comparison view built: {len(view)} datasets."
    )
    return view