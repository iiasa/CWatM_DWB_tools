# src/hydro_eval/core/engine.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Dict


from hydro_eval.config.models import AppConfig
from hydro_eval.indicators.A1_qmean import A1Indicator
from hydro_eval.indicators.A2_fdc import A2Indicator
from hydro_eval.indicators.A3_mts import A3Indicator
from hydro_eval.indicators.B1_lfd import B1Indicator
from hydro_eval.indicators.B2_ldry import B2Indicator
from hydro_eval.indicators.B3_def import B3Indicator
from hydro_eval.indicators.C1_hfd import C1Indicator
from hydro_eval.indicators.C2_amax import C2Indicator
from hydro_eval.indicators.D1_iafd import D1Indicator
from hydro_eval.io.loader import ScenarioIndex, load_discharge_scenarios
from hydro_eval.indicators.preview import PreviewIndicator
from hydro_eval.core.comparison import build_comparison_view
from hydro_eval.core.context import RunContext
from hydro_eval.core.timewindow import to_timewindow
from hydro_eval.indicators.base import Indicator
from hydro_eval.core.exporter import Exporter


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RunSpec:
    """Run-time options coming from CLI.

    Attributes:
        station: Optional station (column name) to load (e.g. "G1").
        only: Optional list of indicator ids to run (e.g. ["A1", "B2"]) (overrides config flags).
        dry_run: if True, only log the execution plan and exit.
    """

    station: str | None
    only: list[str] | None
    dry_run: bool


# Simple registry (strategy pattern)
_INDICATOR_REGISTRY: Dict[str, type[Indicator]] = {
    PreviewIndicator.id: PreviewIndicator,
    "A1": A1Indicator,
    "A2": A2Indicator,
    "A3": A3Indicator,
    "B1": B1Indicator,
    "B2": B2Indicator,
    "B3": B3Indicator,
    "C1": C1Indicator,
    "C2": C2Indicator,
    "D1": D1Indicator,  # placeholder for future D1 indicator
    # Future indicators go here...
}


class AnalysisEngine:
    """Orchestrates discovery -> loading -> indicator execution -> exporting.

    This is intentionally minimal for now. Will be extended after IO layer exists.
    """

    def __init__(self, cfg: AppConfig) -> None:
        self.cfg = cfg

    def _first_item(self, index: ScenarioIndex):
        for ds_map in index.values():
            for item in ds_map.values():
                return item
        return None

    def run(self, spec: RunSpec) -> None:
        """Run the evaluation pipeline according to the provided spec."""
        logger.info(f"Project: {self.cfg.name}")
        logger.info(f"Config: {self.cfg.config_path}")
        logger.info(f"data_root: {self.cfg.paths.data_root}")
        logger.info(f"output_root: {self.cfg.paths.out_root}")

        logger.info(
            f"RunSpec: station={spec.station}, only={spec.only}, dry_run={spec.dry_run}"
        )
        logger.info(f"{'-' * 72}")

        self.cfg.paths.out_root.mkdir(parents=True, exist_ok=True)

        # ---- Load scenarios (discovery + csv reading) ----
        index = load_discharge_scenarios(self.cfg, station=spec.station)

        if not index:
            logger.error(
                "No scenarios loaded. Chech rata_root, floder layout, and variable_q filename."
            )
            return
        selected = self._select_indicators(spec.only)

        # ---- Build comparison view ----
        view = build_comparison_view(index, self.cfg)
        if not view:
            logger.error("No valid comparison datasets available.")
            return
        baseline_p = self.cfg.periods.get("baseline")
        future_p = self.cfg.periods.get("future")

        exporter = Exporter(self.cfg.paths.out_root)

        ctx = RunContext(
            exporter=exporter,
            baseline=to_timewindow("baseline", baseline_p.start, baseline_p.end),  # type: ignore
            future=to_timewindow("future", future_p.start, future_p.end),  # type: ignore
            b2_min_event_days=self.cfg.indicator_params.B2.min_event_days,
        )

        # ---- Handle dry-run ----
        if spec.dry_run:
            n_scenarios = sum(len(ds_map) for ds_map in index.values())
            logger.info(f"Dry-run: loaded_scenarios={n_scenarios}")
            logger.info(f"Comparison datasets: {len(view)}")
            logger.info(f"Available indicators: {sorted(_INDICATOR_REGISTRY.keys())}")
            logger.info(f"Selected indicators: {selected}")
            logger.info(
                f"Baseline window: {ctx.baseline.start.date()} to {ctx.baseline.end.date()}"
            )
            logger.info(
                f"Future window: {ctx.future.start.date()} to {ctx.future.end.date()}"
            )
            # one-line IO sanity check
            first_ds = next(iter(view.keys()))
            sample = view[first_ds]
            logger.info(
                f"Sample scenario: {first_ds} | reference={sample.reference.scenario.experiment} | targets={sorted(sample.targets.keys())}"
            )
            return

        # ---- Run indicators ----
        for ind_id in selected:
            ind_cls = _INDICATOR_REGISTRY.get(ind_id, PreviewIndicator)
            indicator = ind_cls()
            logger.info(f"{'-' * 72}")
            logger.info(f"Running indicator: {ind_id}")
            result = indicator.run(view, ctx=ctx)
            logger.debug(f"Indicator {ind_id} evaluated | outputs={result.n_outputs}")
            logger.info(f"{'-' * 72}")

    def _select_indicators(self, only: List[str] | None) -> List[str]:
        """Select indicators with the following priority:

        1) CLI --only
        2) config [indicators] flags
        3) fallback to preview if nothing selected
        """
        # 1) CLI --only
        if only:
            selected = only
        # 2) config flags
        else:
            selected = [
                key for key, value in self.cfg.indicators.enabled.items() if value
            ]

        unknown = [ind for ind in selected if ind not in _INDICATOR_REGISTRY]
        if unknown:
            logger.error(
                f"Unknown indicator(s): {unknown}. Available: {sorted(_INDICATOR_REGISTRY.keys())}"
            )
            selected = [ind for ind in selected if ind in _INDICATOR_REGISTRY]

        # 3) fallback to preview
        if not selected:
            if self.cfg.indicators.enabled[PreviewIndicator.id]:
                logger.info(
                    "No indicators enabled in config. Falling back to 'preview'."
                )
                selected = [PreviewIndicator.id]
            else:
                logger.warning(
                    "No indicators enabled and no fallback available (preview=False)."
                )
        return selected
