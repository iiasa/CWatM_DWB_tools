# src\hydro_eval\indicators\C1_hfd.py
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
from hydro_eval.core.stats import station_columns, percentiles, fdc_empirical
from hydro_eval.core.hydrology import q_threshold, annual_count_above_threshold

logger = logging.getLogger(__name__)

PERCENTILES = np.array([0, 5, 25, 50, 75, 95, 100], dtype=float)


@dataclass(frozen=True)
class _SummaryRow:
    """Store one summary row for the C1 indicator."""

    dataset: str
    experiment: str
    window: str
    station: str
    exceedance: int
    q95_ref: float
    hfd_mean_days_per_year: float
    hfd_change_vs_baseline_pct: float
    n_years: int
    p0: float
    p5: float
    p25: float
    p50: float
    p75: float
    p95: float
    p100: float


def _plot_hfd_fdc(
    out_path: Path,
    curves: List[Tuple[str, np.ndarray, np.ndarray, str | None]],
    style: PlotStyle,
) -> None:
    """
    Plot empirical exceedance curves for annual HFD values.

    Parameters
    ----------
    out_path : Path
        Output figure path.
    curves : list
        Tuples of (label, p_exceed, values, color).
    style : PlotStyle
        Shared plot style.
    """
    fig, ax = plt.subplots(figsize=(7.0, 4.0))

    for label, p_exc, y, color in curves:
        if p_exc.size == 0:
            continue
        ax.plot(p_exc, y, label=label, color=color)

    ax.set_xlabel("Exceedance probability (%)")
    ax.set_ylabel("High-flow days (days/year)")
    ax.grid(True)

    handles, labels = ax.get_legend_handles_labels()
    uniq = dict(zip(labels, handles))
    legend_bottom(fig, list(uniq.values()), list(uniq.keys()), style=style, ncol=3)
    save_figure(fig, out_path, style=style)
    plt.close(fig)


class C1Indicator:
    """
    Indicator C1 – High-flow Days (HFD).

    Counts annual days above the Q95 threshold derived from the
    reference baseline period.

    Outputs
    -------
    C1_summary.csv
        One summary table with mean annual HFD, selected percentiles
        and percentage change relative to baseline.

    figures
        Empirical exceedance curves of annual HFD values.
    """

    id = "C1"

    def run(self, view: ComparisonView, ctx: RunContext) -> IndicatorResult:
        """
        Run the C1 indicator workflow.

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

        summary_rows: List[_SummaryRow] = []

        # (dataset, station) -> q95 threshold
        q95_map: Dict[Tuple[str, str], float] = {}

        # (dataset, experiment, window, station) -> annual HFD DataFrame
        annual_map: Dict[Tuple[str, str, str, str], pd.DataFrame] = {}

        # (dataset, station) -> baseline mean annual HFD
        baseline_mean_map: Dict[Tuple[str, str], float] = {}

        # --------------------------------------------------------------
        # 1) Build thresholds from reference baseline
        # --------------------------------------------------------------
        for dataset, comp in view.items():
            ref_df_base = slice_window(comp.reference.df, ctx.baseline)

            for station in station_columns(ref_df_base):
                q95_map[(dataset, station)] = q_threshold(
                    ref_df_base, station, quantile=0.95
                )

        # --------------------------------------------------------------
        # 2) Compute annual HFD for reference baseline
        # --------------------------------------------------------------
        for dataset, comp in view.items():
            ref_exp = comp.reference.scenario.experiment
            ref_df_base = slice_window(comp.reference.df, ctx.baseline)

            for station in station_columns(ref_df_base):
                threshold = q95_map.get((dataset, station), float("nan"))
                annual_df = annual_count_above_threshold(
                    ref_df_base, station, threshold
                ).rename(columns={"count": "hfd_days"})
                annual_map[(dataset, ref_exp, ctx.baseline.name, station)] = annual_df

                if annual_df.empty:
                    baseline_mean_map[(dataset, station)] = float("nan")
                else:
                    baseline_mean_map[(dataset, station)] = float(
                        np.nanmean(annual_df["hfd_days"].to_numpy(dtype=float))
                    )

        # --------------------------------------------------------------
        # 3) Compute annual HFD for future targets
        # --------------------------------------------------------------
        for dataset, comp in view.items():
            for exp, target in comp.targets.items():
                tgt_df_fut = slice_window(target.df, ctx.future)

                for station in station_columns(tgt_df_fut):
                    threshold = q95_map.get((dataset, station), float("nan"))
                    annual_df = annual_count_above_threshold(
                        tgt_df_fut, station, threshold
                    ).rename(columns={"count": "hfd_days"})
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
            q95_ref = q95_map.get((dataset, station), float("nan"))

            if annual_df.empty:
                logger.warning(
                    "C1: No annual HFD values | dataset=%s experiment=%s window=%s station=%s",
                    dataset,
                    experiment,
                    window_name,
                    station,
                )
                pvals = {f"p{int(p)}": float("nan") for p in PERCENTILES}
                summary_rows.append(
                    _SummaryRow(
                        dataset=dataset,
                        experiment=experiment,
                        window=window_name,
                        station=station,
                        exceedance=5,
                        q95_ref=q95_ref,
                        hfd_mean_days_per_year=float("nan"),
                        hfd_change_vs_baseline_pct=float("nan"),
                        n_years=0,
                        **pvals,
                    )
                )
                continue

            vals = annual_df["hfd_days"].to_numpy(dtype=float)
            mean_hfd = float(np.nanmean(vals))
            n_years = int(np.sum(~np.isnan(vals)))

            baseline_mean = baseline_mean_map.get((dataset, station), float("nan"))
            if np.isnan(baseline_mean) or baseline_mean == 0:
                change_pct = (
                    0.0
                    if experiment == view[dataset].reference.scenario.experiment
                    else float("nan")
                )
            else:
                change_pct = ((mean_hfd - baseline_mean) / baseline_mean) * 100.0

            pvals = percentiles(vals, PERCENTILES)

            summary_rows.append(
                _SummaryRow(
                    dataset=dataset,
                    experiment=experiment,
                    window=window_name,
                    station=station,
                    exceedance=5,
                    q95_ref=q95_ref,
                    hfd_mean_days_per_year=mean_hfd,
                    hfd_change_vs_baseline_pct=change_pct,
                    n_years=n_years,
                    **pvals,
                )
            )

        # --------------------------------------------------------------
        # 5) Plot FDCs of annual HFD values
        # --------------------------------------------------------------
        n_fig = 0

        for dataset, comp in view.items():
            ref_exp = comp.reference.scenario.experiment
            ref_df_base = slice_window(comp.reference.df, ctx.baseline)

            for station in station_columns(ref_df_base):
                curves: List[Tuple[str, np.ndarray, np.ndarray, str | None]] = []

                ref_annual = annual_map.get(
                    (dataset, ref_exp, ctx.baseline.name, station), pd.DataFrame()
                )
                ref_vals = (
                    ref_annual["hfd_days"].to_numpy(dtype=float)
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
                            "C1: Missing annual data for plotting | dataset=%s station=%s target=%s",
                            dataset,
                            station,
                            exp,
                        )
                        continue

                    tgt_vals = tgt_annual["hfd_days"].to_numpy(dtype=float)
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
                    name=self.id,
                    dataset=dataset,
                    station=station,
                    ext="png",
                )
                _plot_hfd_fdc(out_path, curves, style=style)
                n_fig += 1

        # --------------------------------------------------------------
        # 6) Export summary
        # --------------------------------------------------------------
        n_out = 0

        if summary_rows:
            out_df = pd.DataFrame([row.__dict__ for row in summary_rows])
            out_df = out_df.sort_values(
                ["dataset", "station", "experiment", "window"]
            ).reset_index(drop=True)

            out_path = ctx.exporter.table_path(
                name=f"{self.id}",
                ext="csv",
            )
            out_df.to_csv(out_path, index=False)
            logger.info("C1 exported summary: %s | rows=%d", out_path, len(out_df))
            n_out += 1

        logger.info("C1 exported figures: %d", n_fig)
        return IndicatorResult(id=self.id, n_outputs=n_out + n_fig)
