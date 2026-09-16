# src/hydro_eval/indicators/B2_ldry.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

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
from hydro_eval.core.stats import station_columns, fdc_empirical
from hydro_eval.core.hydrology import q_threshold, annual_spell_metrics

logger = logging.getLogger(__name__)

PERCENTILES = np.array([0, 5, 25, 50, 75, 95, 100], dtype=float)


@dataclass(frozen=True)
class _SummaryRow:
    """Helper dataclass for aggregated B2 summary output."""

    dataset: str
    experiment: str
    window: str
    station: str
    min_event_days: int
    n_periods_total: int
    n_periods_mean_per_yr: float
    mean_period_len_days: float
    max_period_len_days: int | float
    n_years: int


def _plot_b2_fdc(
    out_path: Path,
    curves: List[Tuple[str, np.ndarray, np.ndarray, str | None]],
    ylabel: str,
    style: PlotStyle,
) -> None:
    """
    Plot empirical exceedance curves for B2 annual metrics.

    Parameters
    ----------
    out_path : Path
        Output figure path.
    curves : list
        List of tuples (label, p_exceed, values, color).
    ylabel : str
        Y-axis label.
    style : PlotStyle
        Shared plot styling.
    """
    fig, ax = plt.subplots(figsize=(7.0, 4.0))

    for label, p_exc, y, color in curves:
        if p_exc.size == 0:
            continue
        ax.plot(p_exc, y, label=label, color=color)

    ax.set_xlabel("Exceedance probability (%)")
    ax.set_ylabel(ylabel)
    ax.grid(True)

    handles, labels = ax.get_legend_handles_labels()
    uniq = dict(zip(labels, handles))
    legend_bottom(fig, list(uniq.values()), list(uniq.keys()), style=style, ncol=3)
    save_figure(fig, out_path, style=style)
    plt.close(fig)


class B2Indicator:
    """
    Indicator B2 – Low-flow Period Length (Ldry).

    Computes annual low-flow spell statistics using the Q05 threshold
    derived from the reference baseline period.

    Outputs
    -------
    B2_summary.csv
        One summary table with:
        - total number of valid periods in the evaluated window
        - mean number of periods per year
        - mean period length
        - maximum period length

    figures
        Empirical exceedance curves of annual mean and annual maximum
        period length.
    """

    id = "B2"

    def run(self, view: ComparisonView, ctx: RunContext) -> IndicatorResult:
        """
        Run the B2 indicator workflow.

        Parameters
        ----------
        view : ComparisonView
            Structured comparison input (reference + targets).
        ctx : RunContext
            Shared run context.

        Returns
        -------
        IndicatorResult
            Result metadata with output count.
        """

        style = PlotStyle()
        min_event_days = int(ctx.b2_min_event_days)

        summary_rows: List[_SummaryRow] = []

        # (dataset, station) -> Q05 threshold
        q05_map: Dict[Tuple[str, str], float] = {}

        # (dataset, experiment, window, station) -> annual metrics DataFrame
        annual_map: Dict[Tuple[str, str, str, str], pd.DataFrame] = {}

        # --------------------------------------------------------------
        # 1) Build thresholds from reference baseline
        # --------------------------------------------------------------
        for dataset, comp in view.items():
            ref_df_base = slice_window(comp.reference.df, ctx.baseline)

            for station in station_columns(ref_df_base):
                q05_map[(dataset, station)] = q_threshold(
                    ref_df_base, station, quantile=0.05
                )

        # --------------------------------------------------------------
        # 2) Compute annual metrics for reference baseline
        # --------------------------------------------------------------
        for dataset, comp in view.items():
            ref_exp = comp.reference.scenario.experiment
            ref_df_base = slice_window(comp.reference.df, ctx.baseline)

            for station in station_columns(ref_df_base):
                threshold = q05_map.get((dataset, station), float("nan"))
                annual_df = annual_spell_metrics(
                    ref_df_base,
                    station,
                    threshold,
                    min_event_days=min_event_days,
                )
                annual_map[(dataset, ref_exp, ctx.baseline.name, station)] = annual_df

        # --------------------------------------------------------------
        # 3) Compute annual metrics for future targets
        # --------------------------------------------------------------
        for dataset, comp in view.items():
            for exp, target in comp.targets.items():
                tgt_df_fut = slice_window(target.df, ctx.future)

                for station in station_columns(tgt_df_fut):
                    threshold = q05_map.get((dataset, station), float("nan"))
                    annual_df = annual_spell_metrics(
                        tgt_df_fut,
                        station,
                        threshold,
                        min_event_days=min_event_days,
                    )

                    annual_map[(dataset, exp, ctx.future.name, station)] = annual_df

        # --------------------------------------------------------------
        # 4) Build one summary row per dataset / scenario / station
        # --------------------------------------------------------------
        for (
            dataset,
            experiment,
            window_name,
            station,
        ), annual_df in annual_map.items():
            if annual_df.empty:
                logger.warning(
                    "B2: No annual metrics | dataset=%s experiment=%s window=%s station=%s",
                    dataset,
                    experiment,
                    window_name,
                    station,
                )
                summary_rows.append(
                    _SummaryRow(
                        dataset=dataset,
                        experiment=experiment,
                        window=window_name,
                        station=station,
                        min_event_days=min_event_days,
                        n_periods_total=0,
                        n_periods_mean_per_yr=float("nan"),
                        mean_period_len_days=float("nan"),
                        max_period_len_days=0,
                        n_years=0,
                    )
                )
                continue

            n_years = int(annual_df.shape[0])
            n_periods_total = int(annual_df["n_periods"].sum())
            n_periods_mean_per_year = float(annual_df["n_periods"].mean())
            # Mean over all valid periods in the whole window:
            if n_periods_total > 0:
                mean_period_length_days = (
                    float(annual_df["mean_period_len_days"].dropna().mean())
                    if annual_df["mean_period_len_days"].notna().any()
                    else np.nan
                )
                max_period_length_days = (
                    int(annual_df["max_period_len_days"].max(skipna=True))
                    if annual_df["max_period_len_days"].notna().any()
                    else np.nan
                )
            else:
                mean_period_length_days = 0.0
                max_period_length_days = 0.0

            summary_rows.append(
                _SummaryRow(
                    dataset=dataset,
                    experiment=experiment,
                    window=window_name,
                    station=station,
                    min_event_days=min_event_days,
                    n_periods_total=n_periods_total,
                    n_periods_mean_per_yr=n_periods_mean_per_year,
                    mean_period_len_days=mean_period_length_days,
                    max_period_len_days=max_period_length_days,
                    n_years=n_years,
                )
            )

        # --------------------------------------------------------------
        # 5) Plot FDCs of annual metrics
        # --------------------------------------------------------------
        n_fig = 0

        for dataset, comp in view.items():
            ref_exp = comp.reference.scenario.experiment
            ref_df_base = slice_window(comp.reference.df, ctx.baseline)

            for station in station_columns(ref_df_base):
                for metric, ylabel, suffix in [
                    ("mean_period_len_days", "Mean spell length (days)", "mean"),
                    ("max_period_len_days", "Maximum spell length (days)", "max"),
                ]:
                    curves: List[Tuple[str, np.ndarray, np.ndarray, str | None]] = []

                    ref_annual = annual_map.get(
                        (dataset, ref_exp, ctx.baseline.name, station), pd.DataFrame()
                    )
                    ref_vals = (
                        ref_annual[metric].to_numpy(dtype=float)
                        if not ref_annual.empty
                        else np.array([], dtype=float)
                    )
                    p_exc, y = fdc_empirical(ref_vals)
                    curves.append(
                        (
                            f"Baseline ({ref_exp})",
                            p_exc,
                            y,
                            color_for_experiment(ref_exp, is_reference=True),
                        )
                    )

                    for exp, _target in comp.targets.items():
                        tgt_annual = annual_map.get(
                            (dataset, exp, ctx.future.name, station), pd.DataFrame()
                        )
                        if tgt_annual.empty:
                            logger.warning(
                                "B2: Missing annual data for plotting | dataset=%s station=%s target=%s metric=%s",
                                dataset,
                                station,
                                exp,
                                metric,
                            )
                            continue

                        tgt_vals = tgt_annual[metric].to_numpy(dtype=float)
                        p_exc, y = fdc_empirical(tgt_vals)
                        curves.append(
                            (
                                exp,
                                p_exc,
                                y,
                                color_for_experiment(exp, is_reference=False),
                            )
                        )

                    out_path = ctx.exporter.figure_path(
                        name=f"{self.id}_{suffix}",
                        dataset=dataset,
                        station=station,
                        ext="png",
                    )
                    _plot_b2_fdc(out_path, curves, ylabel=ylabel, style=style)
                    n_fig += 1

        # --------------------------------------------------------------
        # 5) Export summary and percentile tables
        # --------------------------------------------------------------
        n_out = 0

        if summary_rows:
            out_df = pd.DataFrame([row.__dict__ for row in summary_rows])
            out_df = out_df.sort_values(
                ["dataset", "station", "experiment", "window"]
            ).reset_index(drop=True)

            out_path = ctx.exporter.table_path(name=self.id, ext="csv")
            out_df.to_csv(out_path, index=False)
            logger.info(f"B2 exported {self.id}: {out_path} | rows=%d", len(out_df))
            n_out += 1

        logger.info(f"B2 exported figures: {n_fig}")
        return IndicatorResult(id=self.id, n_outputs=n_out + n_fig)
