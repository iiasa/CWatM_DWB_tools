# src/hydro_eval/indicators/B1_lfd.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from hydro_eval.core.comparison import ComparisonView
from hydro_eval.core.context import RunContext
from hydro_eval.core.plotting import (
    PlotStyle,
    color_for_experiment,
    legend_bottom,
    save_figure,
)
from hydro_eval.core.timewindow import slice_window
from hydro_eval.indicators.base import IndicatorResult
from hydro_eval.core.stats import (
    station_columns,
    percentiles,
    fdc_empirical,
)
from hydro_eval.core.hydrology import q_threshold, annual_count_below_threshold

logger = logging.getLogger(__name__)

PERCENTILES = np.array([0, 5, 25, 50, 75, 95, 100], dtype=float)


@dataclass(frozen=True)
class _ThreshRow:
    """Helper dataclass to store threshold information for a single row."""

    dataset: str
    station: str
    start: str
    end: str
    q05_ref: float


def _annual_lfd_values(df: pd.DataFrame, station: str, threshold: float) -> np.ndarray:
    """Calculate annual low-flow day counts for a given station and threshold."""
    ann = annual_count_below_threshold(df, station, threshold).rename(
        columns={"count": "lfd_days"}
    )  # (year, lfd_days)
    return (
        ann["lfd_days"].to_numpy(dtype=float)
        if not ann.empty
        else np.array([], dtype=float)
    )


def _plot_lfd(
    out_path: Path,
    curves: list[tuple[str, np.ndarray, np.ndarray, str | None]],
    style: PlotStyle,
) -> None:
    fig, ax = plt.subplots(figsize=(7.0, 4.0))

    for label, p_exc, y, color in curves:
        if p_exc.size == 0:
            continue
        ax.plot(p_exc, y, label=label, color=color)

    ax.set_xlabel("Exceedance probability (%)")
    ax.set_ylabel("Low-flow days (days/year)")
    ax.grid(True)

    handles, labels = ax.get_legend_handles_labels()
    uniq = dict(zip(labels, handles))
    legend_bottom(fig, list(uniq.values()), list(uniq.keys()), style=style, ncol=3)
    save_figure(fig, out_path, style=style)
    plt.close(fig)


class B1Indicator:
    """
    Indicator B1 – Low-flow Days (LFD).

    Computes the number of days per year when discharge falls below
    the Q05 threshold derived from the reference baseline period.

    Outputs
    -------
    thresholds_q05.csv
        Q05 thresholds derived from baseline reference data.

    summary.csv
        Mean number of low-flow days per year for each dataset,
        experiment and evaluation window.

    percentiles.csv
        Distribution of annual LFD values expressed as selected
        percentiles.

    figures
        Empirical exceedance curves of annual LFD values.
    """

    id = "B1"

    def run(self, view: ComparisonView, ctx: RunContext) -> IndicatorResult:
        """
        Run B1 indicator workflow.

        The indicator:
        1. derives Q05 thresholds from the reference baseline period,
        2. computes annual low-flow day statistics for baseline and future periods,
        3. exports threshold and percentile tables,
        4. plots empirical exceedance curves of annual LFD values.
        """

        def _add_stats(
            dataset: str,
            experiment: str,
            window_name: str,
            df: pd.DataFrame,
            station: str,
            threshold: float,
        ) -> None:
            """
            Compute summary statistics and selected percentiles for one station and period.
            """
            vals = _annual_lfd_values(df, station, threshold)
            if vals.size == 0:
                logger.warning(
                    "B1: No annual values | dataset=%s experiment=%s window=%s station=%s",
                    dataset,
                    experiment,
                    window_name,
                    station,
                )

            mean = float(np.nanmean(vals)) if vals.size else float("nan")
            n_years = int(np.sum(~np.isnan(vals))) if vals.size else 0

            row = {
                "dataset": dataset,
                "experiment": experiment,
                "window": window_name,
                "station": station,
                "mean": float(f"{mean:.1f}") if not np.isnan(mean) else float("nan"),
                "n_years": n_years,
            }
            row.update(percentiles(vals, PERCENTILES))
            perc_rows.append(row)

        def _build_curve(
            label: str,
            df: pd.DataFrame,
            station: str,
            threshold: float,
            color: str | None,
        ) -> Tuple[str, np.ndarray, np.ndarray, str | None]:
            """
            Build one empirical LFD exceedance curve for plotting.
            """
            vals = _annual_lfd_values(df, station, threshold)
            p_exceed, y = fdc_empirical(vals)
            return label, p_exceed, y, color

        style = PlotStyle()

        thresholds: List[_ThreshRow] = []
        perc_rows: List[Dict[str, object]] = []

        # (dataset, station) -> q05 threshold derived from reference baseline
        q05_map: Dict[Tuple[str, str], float] = {}

        # ------------------------------------------------------------------
        # 1) Build thresholds from reference baseline and baseline statistics
        # ------------------------------------------------------------------
        for dataset, comp in view.items():
            ref_exp = comp.reference.scenario.experiment
            ref_df_base = slice_window(comp.reference.df, ctx.baseline)

            for station in station_columns(ref_df_base):
                q05_ref = q_threshold(ref_df_base, station, quantile=0.05)
                q05_map[(dataset, station)] = q05_ref

                thresholds.append(
                    _ThreshRow(
                        dataset=dataset,
                        station=station,
                        start=str(ctx.baseline.start.date()),
                        end=str(ctx.baseline.end.date()),
                        q05_ref=q05_ref,
                    )
                )

                _add_stats(
                    dataset=dataset,
                    experiment=ref_exp,
                    window_name=ctx.baseline.name,
                    df=ref_df_base,
                    station=station,
                    threshold=q05_ref,
                )

        # ------------------------------------------------------------------
        # 2) Build future statistics for all available targets
        # ------------------------------------------------------------------
        for dataset, comp in view.items():
            for exp, target in comp.targets.items():
                tgt_df_fut = slice_window(target.df, ctx.future)

                for station in station_columns(tgt_df_fut):
                    threshold = q05_map.get((dataset, station), float("nan"))

                    _add_stats(
                        dataset=dataset,
                        experiment=exp,
                        window_name=ctx.future.name,
                        df=tgt_df_fut,
                        station=station,
                        threshold=threshold,
                    )

        # ------------------------------------------------------------------
        # 3) Plot empirical exceedance curves (baseline + all targets)
        # ------------------------------------------------------------------
        n_fig = 0

        for dataset, comp in view.items():
            ref_exp = comp.reference.scenario.experiment
            ref_df_base = slice_window(comp.reference.df, ctx.baseline)

            for station in station_columns(ref_df_base):
                threshold = q05_map.get((dataset, station), float("nan"))
                curves: List[Tuple[str, np.ndarray, np.ndarray, str | None]] = []

                # baseline curve
                curves.append(
                    _build_curve(
                        label=f"Baseline ({ctx.baseline.start.year}-{ctx.baseline.end.year})",
                        df=ref_df_base,
                        station=station,
                        threshold=threshold,
                        color=color_for_experiment(ref_exp, is_reference=True),
                    )
                )

                # target curves
                for exp, target in comp.targets.items():
                    tgt_df_fut = slice_window(target.df, ctx.future)

                    if station not in tgt_df_fut.columns:
                        logger.warning(
                            "B1: dataset=%s station=%s missing in target=%s. Skipping curve.",
                            dataset,
                            station,
                            exp,
                        )
                        continue

                    curves.append(
                        _build_curve(
                            label=f"{exp} ({ctx.future.start.year}-{ctx.future.end.year})",
                            df=tgt_df_fut,
                            station=station,
                            threshold=threshold,
                            color=color_for_experiment(exp, is_reference=False),
                        )
                    )

                out_path = ctx.exporter.figure_path(
                    name=self.id,
                    dataset=dataset,
                    experiment=None,
                    station=station,
                    ext="png",
                )
                _plot_lfd(out_path, curves, style=style)
                n_fig += 1

        # ------------------------------------------------------------------
        # 4) Export tables
        # ------------------------------------------------------------------
        n_out = 0

        if thresholds:
            thr_df = (
                pd.DataFrame([t.__dict__ for t in thresholds])
                .sort_values(["dataset", "station"])
                .reset_index(drop=True)
            )
            out_path = ctx.exporter.table_path(
                name=f"{self.id}_thresholds_q05",
                ext="csv",
            )
            thr_df.to_csv(out_path, index=False)
            logger.info("B1 exported thresholds: %s | rows=%d", out_path, len(thr_df))
            n_out += 1

        if perc_rows:
            perc_df = pd.DataFrame(perc_rows)
            perc_cols = [
                "dataset",
                "experiment",
                "window",
                "station",
                "mean",
                "n_years",
            ] + [f"p{int(p)}" for p in PERCENTILES]

            perc_df = (
                perc_df[perc_cols]
                .sort_values(["dataset", "station", "experiment", "window"])
                .reset_index(drop=True)
            )

            out_path = ctx.exporter.table_path(
                name=f"{self.id}_percentiles",
                ext="csv",
            )
            perc_df.to_csv(out_path, index=False)
            logger.info("B1 exported percentiles: %s | rows=%d", out_path, len(perc_df))
            n_out += 1

        logger.info("B1 exported figures: %d", n_fig)
        return IndicatorResult(id=self.id, n_outputs=n_out + n_fig)
