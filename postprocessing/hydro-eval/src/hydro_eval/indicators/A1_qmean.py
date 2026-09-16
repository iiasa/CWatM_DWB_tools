# src/hydro_eval/indicators/A1_qmean.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable, List, Dict, Tuple
import pandas as pd

from hydro_eval.core.comparison import ComparisonView
from hydro_eval.core.context import RunContext
from hydro_eval.core.timewindow import slice_window
from hydro_eval.indicators.base import IndicatorResult
from hydro_eval.core.stats import station_columns

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _A1Row:
    """Structured output for A1_qmean."""

    dataset: str
    experiment: str
    window: str
    station: str
    qmean_cms: float
    pct_change_vs_baseline: float
    n_days: int
    start: str
    end: str


def _compute_qmean(df: pd.DataFrame, stations: Iterable[str]) -> Dict[str, float]:
    """Compute mean flow per station column."""
    out: Dict[str, float] = {}
    for station in stations:
        # Use numeric conversion defensively (CSV might contain strings)
        s = pd.to_numeric(df[station], errors="coerce")
        out[station] = float(s.mean(skipna=True))
    return out


class A1Indicator:
    """A1: Long-term Mean Flow (Qmean)."""

    id = "A1"

    def run(self, view: ComparisonView, ctx: RunContext) -> IndicatorResult:
        rows: List[_A1Row] = []
        baseline_map: Dict[
            Tuple[str, str], float
        ] = {}  # (dataset, station) -> qmean for baseline, used for pct change calculation

        for dataset, comp in view.items():
            # reference -> baseline
            ref_exp = comp.reference.scenario.experiment
            ref_slice = slice_window(comp.reference.df, ctx.baseline)

            stations = station_columns(ref_slice)
            if not stations:
                logger.warning(
                    f"A1: {dataset=} reference has no station columns. Skipping."
                )
            else:
                qmeans = _compute_qmean(ref_slice, stations)
                for station, qmean in qmeans.items():
                    baseline_map[(dataset, station)] = qmean
                    rows.append(
                        _A1Row(
                            dataset=dataset,
                            experiment=ref_exp,
                            window=ctx.baseline.name,
                            station=station,
                            qmean_cms=float(f"{qmeans[station]:.3f}"),
                            pct_change_vs_baseline=0.00,  # baseline vs itself
                            n_days=ref_slice.shape[0],
                            start=str(ctx.baseline.start.date()),
                            end=str(ctx.baseline.end.date()),
                        )
                    )

            # targets -> future
            for exp, target in comp.targets.items():
                tgt_slice = slice_window(target.df, ctx.future)
                stations = station_columns(tgt_slice)

                if not stations:
                    logger.warning(
                        f"A1: {dataset=} target {exp} has no station columns. Skipping."
                    )
                    continue

                qmeans = _compute_qmean(tgt_slice, stations)
                for station, qmean in qmeans.items():
                    base = baseline_map.get((dataset, station))

                    if base is not None and base != 0.0:
                        pct = ((qmean - base) / base) * 100.0
                    else:
                        # if baseline missing or zero, keep NaN to avoit misleading percentage change of 0.0
                        pct = float("nan")

                    rows.append(
                        _A1Row(
                            dataset=dataset,
                            experiment=exp,
                            window=ctx.future.name,
                            station=station,
                            qmean_cms=float(f"{qmeans[station]:.3f}"),
                            pct_change_vs_baseline=float(
                                f"{pct:.2f}" if not pd.isna(pct) else float("nan")
                            ),
                            n_days=tgt_slice.shape[0],
                            start=str(ctx.future.start.date()),
                            end=str(ctx.future.end.date()),
                        )
                    )

        if not rows:
            logger.warning("A1: no outputs generated.")
            return IndicatorResult(id=self.id, n_outputs=0)

        out_df = pd.DataFrame([row.__dict__ for row in rows])
        out_df = out_df.sort_values(
            ["dataset", "experiment", "window", "station"]
        ).reset_index(drop=True)

        out_path = ctx.exporter.table_path(
            name=self.id,
        )

        out_df.to_csv(out_path, index=False)

        logger.info(f"A1 exported: {out_path} | rows={len(out_df)}")
        return IndicatorResult(id=self.id, n_outputs=1)
