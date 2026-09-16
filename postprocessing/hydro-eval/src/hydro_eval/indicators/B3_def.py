# src/hydro_eval/indicators/B3_def.py
from __future__ import annotations

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
from hydro_eval.core.hydrology import q_threshold, annual_deficit_below_threshold

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _SummaryRow:
    """Store one summary row for the B3 indicator."""

    dataset: str
    experiment: str
    window: str
    station: str
    exceedance: int
    q05_ref: float
    deficit_mean_m3: float
    deficit_rel_q05_pct: float
    deficit_rel_baseline_pct: float


def _plot_b3_fdc(
    out_path: Path,
    curves: List[Tuple[str, np.ndarray, np.ndarray, str | None]],
    style: PlotStyle,
) -> None:
    """
    Plot empirical exceedance curves for annual deficit values.

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
    ax.set_ylabel("Annual deficit (m³/year)")
    ax.grid(True)

    handles, labels = ax.get_legend_handles_labels()
    uniq = dict(zip(labels, handles))
    legend_bottom(fig, list(uniq.values()), list(uniq.keys()), style=style, ncol=3)
    save_figure(fig, out_path, style=style)
    plt.close(fig)


class B3Indicator:
    """
    Indicator B3 – Deficit Volume (D).

    Computes annual deficit below the Q05 threshold derived from the
    reference baseline period.

    Outputs
    -------
    B3_summary.csv
        Summary table with:
        - mean annual deficit volume [m3/year]
        - mean annual relative deficit [% of annual Q05 volume]
        - relative change versus baseline [%]

    figures
        Empirical exceedance curves of annual deficit volume.
    """

    id = "B3"

    def run(self, view: ComparisonView, ctx: RunContext) -> IndicatorResult:
        """
        Run the B3 indicator workflow.

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

        # (dataset, station) -> q05 threshold
        q05_map: Dict[Tuple[str, str], float] = {}

        # (dataset, experiment, window, station) -> annual deficit DataFrame
        annual_map: Dict[Tuple[str, str, str, str], pd.DataFrame] = {}

        # (dataset, station) -> baseline mean annual relative deficit [%]
        baseline_rel_map: Dict[Tuple[str, str], float] = {}

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
        # 2) Compute annual deficits for reference baseline
        # --------------------------------------------------------------
        for dataset, comp in view.items():
            ref_exp = comp.reference.scenario.experiment
            ref_df_base = slice_window(comp.reference.df, ctx.baseline)

            for station in station_columns(ref_df_base):
                threshold = q05_map.get((dataset, station), float("nan"))
                annual_df = annual_deficit_below_threshold(
                    ref_df_base, station, threshold
                ).rename(
                    columns={
                        "deficit_rel_q_pct": "deficit_rel_q05_pct",
                    }
                )
                annual_map[(dataset, ref_exp, ctx.baseline.name, station)] = annual_df

                if annual_df.empty:
                    baseline_rel_map[(dataset, station)] = float("nan")
                else:
                    baseline_rel_map[(dataset, station)] = float(
                        np.nanmean(
                            annual_df["deficit_rel_q05_pct"].to_numpy(dtype=float)
                        )
                    )

        # --------------------------------------------------------------
        # 3) Compute annual deficits for future targets
        # --------------------------------------------------------------
        for dataset, comp in view.items():
            for exp, target in comp.targets.items():
                tgt_df_fut = slice_window(target.df, ctx.future)

                for station in station_columns(tgt_df_fut):
                    threshold = q05_map.get((dataset, station), float("nan"))
                    annual_df = annual_deficit_below_threshold(
                        tgt_df_fut, station, threshold
                    ).rename(
                        columns={
                            "deficit_rel_q_pct": "deficit_rel_q05_pct",
                        }
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
            q05_ref = q05_map.get((dataset, station), float("nan"))

            if annual_df.empty:
                logger.warning(
                    "B3: No annual deficits | dataset=%s experiment=%s window=%s station=%s",
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
                        exceedance=95,
                        q05_ref=q05_ref,
                        deficit_mean_m3=float("nan"),
                        deficit_rel_q05_pct=float("nan"),
                        deficit_rel_baseline_pct=float("nan"),
                    )
                )
                continue

            annual_m3 = annual_df["deficit_m3"].to_numpy(dtype=float)
            annual_rel = annual_df["deficit_rel_q05_pct"].to_numpy(dtype=float)

            deficit_mean_m3 = float(np.nanmean(annual_m3))
            deficit_rel_q05_pct = float(np.nanmean(annual_rel))

            baseline_rel = baseline_rel_map.get((dataset, station), float("nan"))
            if np.isnan(baseline_rel) or baseline_rel == 0:
                change_pct = (
                    0.0
                    if experiment == view[dataset].reference.scenario.experiment
                    else float("nan")
                )
            else:
                change_pct = (
                    (deficit_rel_q05_pct - baseline_rel) / baseline_rel
                ) * 100.0

            summary_rows.append(
                _SummaryRow(
                    dataset=dataset,
                    experiment=experiment,
                    window=window_name,
                    station=station,
                    exceedance=95,
                    q05_ref=q05_ref,
                    deficit_mean_m3=deficit_mean_m3,
                    deficit_rel_q05_pct=deficit_rel_q05_pct,
                    deficit_rel_baseline_pct=change_pct,
                )
            )

        # --------------------------------------------------------------
        # 5) Plot FDCs of annual deficit volume
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
                    ref_annual["deficit_m3"].to_numpy(dtype=float)
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
                            "B3: Missing annual data for plotting | dataset=%s station=%s target=%s",
                            dataset,
                            station,
                            exp,
                        )
                        continue

                    tgt_vals = tgt_annual["deficit_m3"].to_numpy(dtype=float)
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
                _plot_b3_fdc(out_path, curves, style=style)
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
            logger.info("B3 exported summary: %s | rows=%d", out_path, len(out_df))
            n_out += 1

        logger.info("B3 exported figures: %d", n_fig)
        return IndicatorResult(id=self.id, n_outputs=n_out + n_fig)
