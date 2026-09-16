# src/hydro_eval/indicators/D1_iafd.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import matplotlib.pyplot as plt
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
from hydro_eval.core.stats import station_columns
from hydro_eval.core.hydrology import daily_regime


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _ClimRow:
    """Store one climatology row for D1 output."""

    dataset: str
    experiment: str
    window: str
    station: str
    doy: int
    month: int
    day: int
    mean: float
    p05: float
    p25: float
    p75: float
    p95: float


def _month_tick_positions() -> Tuple[List[int], List[str]]:
    """
    Return approximate month-start positions for a 365-day climatological year.

    Returns
    -------
    tuple[list[int], list[str]]
        Tick positions and month labels.
    """
    month_starts = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]
    month_labels = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ]
    return month_starts, month_labels


def _plot_d1(
    out_path: Path,
    baseline: pd.DataFrame,
    target: pd.DataFrame,
    baseline_label: str,
    target_label: str,
    baseline_color: str | None,
    target_color: str | None,
    style: PlotStyle,
) -> None:
    """
    Plot intra-annual flow distribution for baseline vs target.

    Parameters
    ----------
    out_path : Path
        Output figure path.
    baseline : pd.DataFrame
        Baseline climatology.
    target : pd.DataFrame
        Target climatology.
    baseline_label : str
        Label for baseline mean line.
    target_label : str
        Label for target mean line.
    baseline_color : str | None
        Baseline line color.
    target_color : str | None
        Target line color.
    style : PlotStyle
        Shared plot style.
    """
    fig, ax = plt.subplots(figsize=(8.0, 4.8))

    # Baseline bands
    ax.fill_between(
        baseline["doy"],
        baseline["p05"],
        baseline["p95"],
        color=baseline_color,
        alpha=0.12,
        label="Baseline P05–P95",
    )
    ax.fill_between(
        baseline["doy"],
        baseline["p25"],
        baseline["p75"],
        color=baseline_color,
        alpha=0.22,
        label="Baseline P25–P75",
    )
    ax.plot(
        baseline["doy"],
        baseline["mean"],
        color=baseline_color,
        linewidth=1.8,
        label=baseline_label,
    )

    # Target bands
    ax.fill_between(
        target["doy"],
        target["p05"],
        target["p95"],
        color=target_color,
        alpha=0.12,
        label=f"{target_label} P05–P95",
    )
    ax.fill_between(
        target["doy"],
        target["p25"],
        target["p75"],
        color=target_color,
        alpha=0.22,
        label=f"{target_label} P25–P75",
    )
    ax.plot(
        target["doy"],
        target["mean"],
        color=target_color,
        linewidth=1.8,
        label=f"{target_label} mean",
    )

    month_pos, month_labels = _month_tick_positions()
    ax.set_xticks(month_pos)
    ax.set_xticklabels(month_labels)

    ax.set_xlim(1, 365)
    ax.set_ylabel("Discharge (m³/s)")
    ax.grid(True)

    handles, labels = ax.get_legend_handles_labels()
    uniq = dict(zip(labels, handles))
    legend_bottom(
        fig,
        list(uniq.values()),
        list(uniq.keys()),
        style=style,
        ncol=3,
    )
    save_figure(fig, out_path, style=style)
    plt.close(fig)


class D1Indicator:
    """
    Indicator D1 – Intra-annual Flow Distribution (IAFD).

    Computes a climatological average year from daily discharge
    and exports mean and variability bands for each day-of-year.

    Outputs
    -------
    D1_climatology.csv
        Daily climatology with mean, P05, P25, P75 and P95.

    figures
        Baseline vs target climatology plots with variability bands.
    """

    id = "D1"

    def run(self, view: ComparisonView, ctx: RunContext) -> IndicatorResult:
        """
        Run the D1 indicator workflow.

        Parameters
        ----------
        view : ComparisonView
            Structured comparison input.
        ctx : RunContext
            Shared run context.

        Returns
        -------
        IndicatorResult
            Metadata about generated outputs.
        """
        style = PlotStyle()
        rows: List[_ClimRow] = []

        # (dataset, experiment, window, station) -> climatology dataframe
        clim_map: Dict[Tuple[str, str, str, str], pd.DataFrame] = {}

        # --------------------------------------------------------------
        # 1) Compute baseline climatology
        # --------------------------------------------------------------
        for dataset, comp in view.items():
            ref_exp = comp.reference.scenario.experiment
            ref_df = slice_window(comp.reference.df, ctx.baseline)

            for station in station_columns(ref_df):
                clim = daily_regime(ref_df, station)
                clim_map[(dataset, ref_exp, ctx.baseline.name, station)] = clim

                for _, row in clim.iterrows():
                    rows.append(
                        _ClimRow(
                            dataset=dataset,
                            experiment=ref_exp,
                            window=ctx.baseline.name,
                            station=station,
                            doy=int(row["doy"]),
                            month=int(row["month"]),
                            day=int(row["day"]),
                            mean=float(row["mean"]),
                            p05=float(row["p05"]),
                            p25=float(row["p25"]),
                            p75=float(row["p75"]),
                            p95=float(row["p95"]),
                        )
                    )

        # --------------------------------------------------------------
        # 2) Compute future climatology
        # --------------------------------------------------------------
        for dataset, comp in view.items():
            for exp, target in comp.targets.items():
                tgt_df = slice_window(target.df, ctx.future)

                for station in station_columns(tgt_df):
                    clim = daily_regime(tgt_df, station)
                    clim_map[(dataset, exp, ctx.future.name, station)] = clim

                    for _, row in clim.iterrows():
                        rows.append(
                            _ClimRow(
                                dataset=dataset,
                                experiment=exp,
                                window=ctx.future.name,
                                station=station,
                                doy=int(row["doy"]),
                                month=int(row["month"]),
                                day=int(row["day"]),
                                mean=float(row["mean"]),
                                p05=float(row["p05"]),
                                p25=float(row["p25"]),
                                p75=float(row["p75"]),
                                p95=float(row["p95"]),
                            )
                        )

        # --------------------------------------------------------------
        # 3) Plot baseline vs targets
        # --------------------------------------------------------------
        n_fig = 0

        for dataset, comp in view.items():
            ref_exp = comp.reference.scenario.experiment
            ref_df = slice_window(comp.reference.df, ctx.baseline)

            for station in station_columns(ref_df):
                baseline = clim_map.get(
                    (dataset, ref_exp, ctx.baseline.name, station), pd.DataFrame()
                )
                if baseline.empty:
                    logger.warning(
                        "D1: Missing baseline climatology | dataset=%s station=%s",
                        dataset,
                        station,
                    )
                    continue

                for exp, _target in comp.targets.items():
                    future = clim_map.get(
                        (dataset, exp, ctx.future.name, station), pd.DataFrame()
                    )
                    if future.empty:
                        logger.warning(
                            "D1: Missing future climatology | dataset=%s station=%s target=%s",
                            dataset,
                            station,
                            exp,
                        )
                        continue

                    out_path = ctx.exporter.figure_path(
                        name=f"{self.id}_{exp}",
                        dataset=dataset,
                        station=station,
                        ext="png",
                    )

                    _plot_d1(
                        out_path=out_path,
                        baseline=baseline,
                        target=future,
                        baseline_label="Baseline mean",
                        target_label=exp.upper() if exp.startswith("ssp") else exp,
                        baseline_color=color_for_experiment(ref_exp, is_reference=True),
                        target_color=color_for_experiment(exp, is_reference=False),
                        style=style,
                    )
                    n_fig += 1

        # --------------------------------------------------------------
        # 4) Export climatology table
        # --------------------------------------------------------------
        n_out = 0

        if rows:
            out_df = pd.DataFrame([row.__dict__ for row in rows])
            out_df = out_df.sort_values(
                ["dataset", "station", "experiment", "window", "doy"]
            ).reset_index(drop=True)

            out_path = ctx.exporter.table_path(
                name=f"{self.id}_climatology",
                ext="csv",
            )
            out_df.to_csv(out_path, index=False)
            logger.info("D1 exported climatology: %s | rows=%d", out_path, len(out_df))
            n_out += 1

        logger.info("D1 exported figures: %d", n_fig)
        return IndicatorResult(id=self.id, n_outputs=n_out + n_fig)
